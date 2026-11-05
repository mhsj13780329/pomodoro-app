import { get, set } from "idb-keyval";
import { create } from "zustand";
import {
  noteBatchResultSchema,
  notePullSchema,
  NOTE_BATCH_MAX,
  type NoteBatch,
  type NoteWire,
} from "@/lib/notes/contract";
import { adoptNotes, settleNotes } from "@/lib/notes/settle";

type Saved = { notes: Record<string, NoteWire>; queue: Record<string, NoteWire>; cursor: number };

const key = (userId: string) => `pomodoro-notes:${userId}`;

export type NoteWriteResult = "ok" | "missing" | "pro_required";

type NotesState = {
  userId: string | null;
  notes: Record<string, NoteWire>;
  /** Latest full row per note id that still has to upload. */
  queue: Record<string, NoteWire>;
  cursor: number;
  pro: boolean;
  /** True once the saved copy is read and the first pull finished (or failed offline with saved notes). */
  loaded: boolean;
  offline: boolean;

  start: (userId: string, pro: boolean) => Promise<void>;
  stop: () => void;
  sync: () => Promise<void>;
  /** Creates an empty note. Returns its id, or pro_required. */
  create: () => string | "pro_required";
  save: (id: string, patch: { title: string; body: string }) => NoteWriteResult;
  remove: (id: string) => NoteWriteResult;
};

let running = false;
let again = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** A strictly later stamp than the previous one for the same note, so a quick second edit still wins. */
function stampAfter(previous: string | undefined): string {
  const floor = previous ? Date.parse(previous) + 1 : 0;
  return new Date(Math.max(Date.now(), floor)).toISOString();
}

export const useNotesStore = create<NotesState>()((setState, getState) => {
  function persist() {
    const { userId, notes, queue, cursor } = getState();
    if (userId) void set(key(userId), { notes, queue, cursor } satisfies Saved).catch(() => {});
  }

  function schedule() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => void getState().sync(), 300);
  }

  async function flush(): Promise<boolean> {
    const { queue } = getState();
    const batch: NoteBatch = { notes: Object.values(queue).slice(0, NOTE_BATCH_MAX) };
    if (batch.notes.length === 0) return true;
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(batch),
      });
      if (response.status === 400) {
        // The batch itself is malformed and would never be accepted. Drop it instead of retrying forever.
        const next = { ...getState().queue };
        for (const row of batch.notes) if (next[row.id]?.updatedAt === row.updatedAt) delete next[row.id];
        setState({ queue: next });
        return true;
      }
      if (!response.ok) return false;
      const parsed = noteBatchResultSchema.safeParse(await response.json());
      if (!parsed.success) return false;
      const local = settleNotes({ notes: getState().notes, queue: getState().queue }, batch, parsed.data);
      setState({ ...local, pro: parsed.data.pro, offline: false });
      return Object.keys(local.queue).length === 0 || batch.notes.length < NOTE_BATCH_MAX ? true : flush();
    } catch {
      return false;
    }
  }

  async function pull(): Promise<boolean> {
    try {
      const response = await fetch(`/api/notes?since=${getState().cursor}`, { credentials: "include" });
      if (!response.ok) return false;
      const parsed = notePullSchema.safeParse(await response.json());
      if (!parsed.success) return false;
      const pulled = parsed.data;
      const notes = adoptNotes({ notes: getState().notes, queue: getState().queue }, pulled.notes, pulled.full);
      setState({ notes, cursor: pulled.cursor, pro: pulled.pro, offline: false });
      return true;
    } catch {
      return false;
    }
  }

  return {
    userId: null,
    notes: {},
    queue: {},
    cursor: 0,
    pro: false,
    loaded: false,
    offline: false,

    async start(userId, pro) {
      if (getState().userId === userId) return;
      setState({ userId, notes: {}, queue: {}, cursor: 0, pro, loaded: false, offline: false });
      const saved = await get<Saved>(key(userId)).catch(() => undefined);
      if (getState().userId !== userId) return;
      if (saved) setState({ notes: saved.notes, queue: saved.queue, cursor: saved.cursor });
      await getState().sync();
    },

    stop() {
      if (flushTimer) clearTimeout(flushTimer);
      setState({ userId: null, notes: {}, queue: {}, cursor: 0, loaded: false });
    },

    async sync() {
      if (!getState().userId) return;
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        do {
          again = false;
          const flushed = await flush();
          const pulled = flushed && (await pull());
          setState({ offline: !pulled, loaded: true });
          persist();
        } while (again);
      } finally {
        running = false;
      }
    },

    create() {
      if (!getState().pro) return "pro_required";
      const now = new Date().toISOString();
      const row: NoteWire = { id: crypto.randomUUID(), title: "", body: "", createdAt: now, updatedAt: now, deletedAt: null };
      setState((s) => ({ notes: { ...s.notes, [row.id]: row }, queue: { ...s.queue, [row.id]: row } }));
      persist();
      schedule();
      return row.id;
    },

    save(id, patch) {
      const current = getState().notes[id];
      if (!current) return "missing";
      if (!getState().pro) return "pro_required";
      if (current.title === patch.title && current.body === patch.body) return "ok";
      const row = { ...current, ...patch, updatedAt: stampAfter(current.updatedAt) };
      setState((s) => ({ notes: { ...s.notes, [id]: row }, queue: { ...s.queue, [id]: row } }));
      persist();
      schedule();
      return "ok";
    },

    remove(id) {
      const current = getState().notes[id];
      if (!current) return "missing";
      const stamp = stampAfter(current.updatedAt);
      const row = { ...current, updatedAt: stamp, deletedAt: stamp };
      setState((s) => {
        const notes = { ...s.notes };
        delete notes[id];
        return { notes, queue: { ...s.queue, [id]: row } };
      });
      persist();
      schedule();
      return "ok";
    },
  };
});
