import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ImportTask } from "@/lib/import/contract";
import { useTimerStore } from "@/features/timer/store";
import type { SessionInput } from "@/lib/sync/contract";
import type { QueuedTaskRows } from "@/lib/sync/db";
import { publishTaskWrites, syncIsActive, syncNow } from "@/lib/sync/engine";
import { adoptServerCounts, NO_COUNTS, noteUploaded, type ServerCounts } from "@/lib/tasks/counts";
import type {
  ProjectColor,
  ProjectWire,
  TagWire,
  TaskBatch,
  TaskBatchResult,
  TasksBlock,
  TaskWire,
} from "@/lib/tasks/contract";
import { gateProItemWrite, gateTaskWrite, isActiveTask } from "@/lib/tasks/gate";
import { adoptRows } from "@/lib/tasks/merge";
import { moveTask as planMove, nextOrder } from "@/lib/tasks/order";
import { activeTasks } from "@/lib/tasks/select";
import { settleBatch, type PendingStamps } from "@/lib/tasks/settle";

export type TaskNotice = "active_limit" | "pro_required";

/** Why a write did not happen. "ok" means it did. */
export type WriteResult = "ok" | "missing" | "empty" | "active_limit" | "pro_required";

export const TITLE_MAX = 200;
export const PROJECT_NAME_MAX = 60;

type TaskPatch = Partial<Pick<TaskWire, "title" | "notes" | "estimatePomodoros" | "projectId" | "tagIds" | "parentId">>;
type ProjectPatch = Partial<Pick<ProjectWire, "name" | "color" | "archived">>;

type TasksState = {
  tasks: Record<string, TaskWire>;
  projects: Record<string, ProjectWire>;
  tags: Record<string, TagWire>;
  /** Completed focus sessions per task as the server counted them, and which recent ids those include. */
  counts: ServerCounts;
  /** What the server said about this account at the last pull. Guests are never Pro. */
  pro: boolean;
  /** Pull cursor. 0 means the next pull asks for everything. */
  cursor: number;
  /** The account these rows belong to. null = guest rows that no account has claimed yet. */
  ownerId: string | null;

  // Not persisted.
  hydrated: boolean;
  /** Signed in: true once the first pull has been adopted (or there are cached rows to show). */
  loaded: boolean;
  pending: PendingStamps;
  pendingSessions: SessionInput[];
  notice: TaskNotice | null;

  /** `projectId` (Pro) files the new task straight into that project. */
  addTask: (title: string, projectId?: string | null) => WriteResult;
  /** Pro: a task one level under another task. */
  addSubtask: (parentId: string, title: string) => WriteResult;
  renameTask: (id: string, title: string) => WriteResult;
  setDone: (id: string, done: boolean) => WriteResult;
  updateTask: (id: string, patch: TaskPatch) => WriteResult;
  removeTask: (id: string) => WriteResult;
  moveTask: (id: string, direction: "up" | "down") => WriteResult;

  /** Returns the new project's id when it was created. */
  addProject: (name: string, color: ProjectColor) => { result: WriteResult; id: string | null };
  updateProject: (id: string, patch: ProjectPatch) => WriteResult;
  /**
   * Deletes a project. Its tasks (done ones too) either move to "no project" or are deleted with it,
   * subtasks included. Past focus sessions are never touched, so stats keep them.
   */
  removeProject: (id: string, options?: { deleteTasks?: boolean }) => WriteResult;
  /** Returns the id of an existing live tag with that name, or of the new one. */
  addTag: (name: string) => { result: WriteResult; id: string | null };
  removeTag: (id: string) => WriteResult;

  dismissNotice: () => void;

  // Called by the sync engine.
  hydrate: () => Promise<void>;
  /** Called at sign-in. `imported` says the guest rows reached this account. */
  claim: (userId: string, imported: boolean) => void;
  since: () => number;
  adoptBlock: (block: TasksBlock) => void;
  settle: (sent: TaskBatch, result: TaskBatchResult) => void;
  setPending: (queue: QueuedTaskRows) => void;
  sessionsChanged: (waiting: SessionInput[], uploaded: SessionInput[]) => void;
  /** Logout: forget everything on this device. */
  reset: () => void;
};

const empty = {
  tasks: {},
  projects: {},
  tags: {},
  counts: NO_COUNTS,
  pro: false,
  cursor: 0,
  ownerId: null,
} satisfies Partial<TasksState>;

/**
 * The edit time for a write. Signed in, it follows the server's clock (the same corrected
 * clock the timer uses). It is always later than the row's previous stamp, so two quick
 * edits in the same millisecond still order correctly under last-write-wins.
 */
function nextStamp(previous?: string): string {
  const now = syncIsActive() ? syncNow() : Date.now();
  const floor = previous ? Date.parse(previous) + 1 : 0;
  return new Date(Math.max(now, floor)).toISOString();
}

function cleanTitle(title: string): string {
  return title.trim().slice(0, TITLE_MAX);
}

let hydration: Promise<void> | null = null;

/** Loads the saved tasks once. Everything that reads them first awaits this. */
export function hydrateTasks(): Promise<void> {
  hydration ??= useTasksStore.getState().hydrate();
  return hydration;
}

/**
 * Tasks made while signed out. They are still "guest" tasks while ownerId is null: once an account
 * has taken them, the store records its id and they are not uploaded again.
 * No deleted tasks and no subtasks. The upload takes at most 500: unfinished first, then the newest finished.
 */
export function guestTasksOf(state: Pick<TasksState, "ownerId" | "tasks">): ImportTask[] {
  if (state.ownerId != null) return [];
  return Object.values(state.tasks)
    .filter((task) => task.deletedAt == null && task.parentId == null)
    .map((task) => ({
      id: task.id,
      title: task.title,
      done: task.done,
      doneAt: task.doneAt,
      order: Math.round(task.order),
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }))
    .sort((a, b) => Number(a.done) - Number(b.done) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 500);
}

/** Reads the hydrated store. Await hydrateTasks() first. */
export function guestTasksSnapshot(): ImportTask[] {
  return guestTasksOf(useTasksStore.getState());
}

export const useTasksStore = create<TasksState>()(
  persist(
    (set, get) => {
      type Changed = { tasks?: TaskWire[]; projects?: ProjectWire[]; tags?: TagWire[] };

      /**
       * Applies rows locally at once, then queues them for upload when signed in.
       * Guests have no server: a deleted row is simply gone and nothing is queued.
       */
      const commit = (changed: Changed) => {
        const state = get();
        const tasks = { ...state.tasks };
        const projects = { ...state.projects };
        const tags = { ...state.tags };
        const pending = { ...state.pending };
        const online = syncIsActive();

        const put = <T extends { id: string; updatedAt: string; deletedAt: string | null }>(
          into: Record<string, T>,
          row: T,
        ) => {
          if (row.deletedAt != null) delete into[row.id];
          else into[row.id] = row;
          if (online) pending[row.id] = row.updatedAt;
        };
        for (const row of changed.tasks ?? []) put(tasks, row);
        for (const row of changed.projects ?? []) put(projects, row);
        for (const row of changed.tags ?? []) put(tags, row);

        // A deleted task takes its subtasks with it on the server; do the same here at once.
        for (const row of changed.tasks ?? []) {
          if (row.deletedAt == null) continue;
          for (const child of Object.values(tasks)) if (child.parentId === row.id) delete tasks[child.id];
        }

        set({ tasks, projects, tags, pending, notice: null });
        if (online) publishTaskWrites(changed);

        // The running timer keeps running. It only stops pointing at a task that is done or gone.
        const picked = useTimerStore.getState().taskId;
        if (picked) {
          const gone = new Set((changed.tasks ?? []).filter((row) => row.deletedAt != null).map((row) => row.id));
          const hit = (changed.tasks ?? []).find((row) => row.id === picked);
          const parentGone = state.tasks[picked]?.parentId != null && gone.has(state.tasks[picked]!.parentId!);
          if ((hit && (hit.done || hit.deletedAt != null)) || parentGone) useTimerStore.getState().setTask(null);
        }
      };

      const refuse = (reason: TaskNotice): WriteResult => {
        set({ notice: reason });
        return reason;
      };

      /** Gate (the same rules the server applies), then commit. */
      const writeTask = (stored: TaskWire | null, next: TaskWire): WriteResult => {
        const state = get();
        const others = Object.values(state.tasks).filter((task) => task.id !== next.id && isActiveTask(task)).length;
        const gate = gateTaskWrite(stored, next, { pro: state.pro, activeCount: others });
        if (!gate.ok) return refuse(gate.reason);
        commit({ tasks: [next] });
        return "ok";
      };

      const editTask = (id: string, patch: Partial<TaskWire>): WriteResult => {
        const stored = get().tasks[id];
        if (!stored) return "missing";
        return writeTask(stored, { ...stored, ...patch, updatedAt: nextStamp(stored.updatedAt) });
      };

      return {
        ...empty,
        hydrated: false,
        loaded: false,
        pending: {},
        pendingSessions: [],
        notice: null,

        addTask: (title, projectId = null) => {
          const clean = cleanTitle(title);
          if (!clean) return "empty";
          const stamp = nextStamp();
          const topLevel = Object.values(get().tasks).filter((task) => task.parentId == null);
          return writeTask(null, {
            id: crypto.randomUUID(),
            title: clean,
            notes: null,
            estimatePomodoros: null,
            done: false,
            doneAt: null,
            order: nextOrder(topLevel),
            projectId: projectId && get().projects[projectId] ? projectId : null,
            parentId: null,
            tagIds: [],
            createdAt: stamp,
            updatedAt: stamp,
            deletedAt: null,
          });
        },

        addSubtask: (parentId, title) => {
          const parent = get().tasks[parentId];
          // Subtasks are one level deep, the same rule the server applies.
          if (!parent || parent.parentId != null) return "missing";
          const clean = cleanTitle(title);
          if (!clean) return "empty";
          const stamp = nextStamp();
          const siblings = Object.values(get().tasks).filter((task) => task.parentId === parentId);
          // writeTask runs the gate: a free account is refused here with "pro_required".
          return writeTask(null, {
            id: crypto.randomUUID(),
            title: clean,
            notes: null,
            estimatePomodoros: null,
            done: false,
            doneAt: null,
            order: nextOrder(siblings),
            projectId: null,
            parentId,
            tagIds: [],
            createdAt: stamp,
            updatedAt: stamp,
            deletedAt: null,
          });
        },

        renameTask: (id, title) => {
          const clean = cleanTitle(title);
          if (!clean) return "empty";
          return editTask(id, { title: clean });
        },

        setDone: (id, done) => {
          const stored = get().tasks[id];
          if (!stored) return "missing";
          if (stored.done === done) return "ok";
          const stamp = nextStamp(stored.updatedAt);
          return writeTask(stored, { ...stored, done, doneAt: done ? stamp : null, updatedAt: stamp });
        },

        updateTask: (id, patch) => {
          if (patch.title !== undefined) {
            const clean = cleanTitle(patch.title);
            if (!clean) return "empty";
            return editTask(id, { ...patch, title: clean });
          }
          return editTask(id, patch);
        },

        removeTask: (id) => {
          const stored = get().tasks[id];
          if (!stored) return "missing";
          const stamp = nextStamp(stored.updatedAt);
          return writeTask(stored, { ...stored, deletedAt: stamp, updatedAt: stamp });
        },

        moveTask: (id, direction) => {
          const state = get();
          const changes = planMove(activeTasks(state.tasks), id, direction);
          const rows = changes.flatMap(({ id: changedId, order }) => {
            const stored = state.tasks[changedId];
            return stored ? [{ ...stored, order, updatedAt: nextStamp(stored.updatedAt) }] : [];
          });
          if (rows.length > 0) commit({ tasks: rows });
          return "ok";
        },

        addProject: (name, color) => {
          const clean = name.trim().slice(0, PROJECT_NAME_MAX);
          if (!clean) return { result: "empty", id: null };
          if (!gateProItemWrite({ pro: get().pro }).ok) return { result: refuse("pro_required"), id: null };
          const stamp = nextStamp();
          const id = crypto.randomUUID();
          commit({
            projects: [{ id, name: clean, color, archived: false, createdAt: stamp, updatedAt: stamp, deletedAt: null }],
          });
          return { result: "ok", id };
        },

        updateProject: (id, patch) => {
          const stored = get().projects[id];
          if (!stored) return "missing";
          if (!gateProItemWrite({ pro: get().pro }).ok) return refuse("pro_required");
          const name = patch.name === undefined ? stored.name : patch.name.trim().slice(0, PROJECT_NAME_MAX);
          if (!name) return "empty";
          commit({ projects: [{ ...stored, ...patch, name, updatedAt: nextStamp(stored.updatedAt) }] });
          return "ok";
        },

        removeProject: (id, options = {}) => {
          const state = get();
          const stored = state.projects[id];
          if (!stored) return "missing";
          if (!gateProItemWrite({ pro: state.pro }).ok) return refuse("pro_required");
          const stamp = nextStamp(stored.updatedAt);
          const live = Object.values(state.tasks).filter((task) => task.deletedAt == null);
          const owned = live.filter((task) => task.projectId === id);
          const ownedIds = new Set(owned.map((task) => task.id));
          const children = live.filter((task) => task.parentId != null && ownedIds.has(task.parentId) && !ownedIds.has(task.id));
          const tasks = options.deleteTasks
            ? [...owned, ...children].map((task) => {
                const at = nextStamp(task.updatedAt);
                return { ...task, deletedAt: at, updatedAt: at };
              })
            : // Clearing a project is always allowed, so this works for any account.
              owned.map((task) => ({ ...task, projectId: null, updatedAt: nextStamp(task.updatedAt) }));
          commit({ projects: [{ ...stored, deletedAt: stamp, updatedAt: stamp }], tasks });
          return "ok";
        },

        addTag: (name) => {
          const clean = name.trim().slice(0, 40);
          if (!clean) return { result: "empty", id: null };
          // Two devices can invent the same tag offline, so reuse a live tag with the same name.
          const same = Object.values(get().tags).find((tag) => tag.name.toLowerCase() === clean.toLowerCase());
          if (same) return { result: "ok", id: same.id };
          if (!gateProItemWrite({ pro: get().pro }).ok) return { result: refuse("pro_required"), id: null };
          const stamp = nextStamp();
          const id = crypto.randomUUID();
          commit({ tags: [{ id, name: clean, createdAt: stamp, updatedAt: stamp, deletedAt: null }] });
          return { result: "ok", id };
        },

        removeTag: (id) => {
          const stored = get().tags[id];
          if (!stored) return "missing";
          if (!gateProItemWrite({ pro: get().pro }).ok) return refuse("pro_required");
          const stamp = nextStamp(stored.updatedAt);
          commit({ tags: [{ ...stored, deletedAt: stamp, updatedAt: stamp }] });
          return "ok";
        },

        dismissNotice: () => set({ notice: null }),

        hydrate: async () => {
          await useTasksStore.persist.rehydrate();
          set({ hydrated: true });
        },

        claim: (userId, imported) => {
          const state = get();
          if (state.ownerId === userId) return;
          if (state.ownerId !== null) {
            // Rows cached for another account must never show up under this one.
            set({ ...empty, ownerId: userId, loaded: false, pending: {}, pendingSessions: [], notice: null });
            return;
          }
          // Guest rows. Once the import has sent them to this account, keep them on screen and ask
          // for the full set, so the server's version replaces them. If the import failed they stay
          // unclaimed: pulls then only add to them, so nothing the guest made is dropped, and the
          // next start tries the import again.
          if (imported) set({ ownerId: userId, cursor: 0 });
        },

        since: () => get().cursor,

        adoptBlock: (block) => {
          const state = get();
          const pendingIds = new Set(Object.keys(state.pending));
          // "Everything the server has" may replace local rows only once an account owns them.
          const full = block.full && state.ownerId !== null;
          set({
            tasks: adoptRows(state.tasks, block.tasks, pendingIds, full),
            projects: adoptRows(state.projects, block.projects, pendingIds, full),
            tags: adoptRows(state.tags, block.tags, pendingIds, full),
            counts: adoptServerCounts(block),
            pro: block.pro,
            cursor: block.cursor,
            loaded: true,
          });
        },

        settle: (sent, result) => {
          const state = get();
          const settled = settleBatch(
            { tasks: state.tasks, projects: state.projects, tags: state.tags },
            state.pending,
            sent,
            result,
          );
          set({
            ...settled.rows,
            pending: settled.pending,
            pro: result.pro,
            notice: settled.refused ?? state.notice,
          });
        },

        setPending: (queue) => {
          const pending: PendingStamps = {};
          for (const row of [
            ...Object.values(queue.tasks),
            ...Object.values(queue.projects),
            ...Object.values(queue.tags),
          ]) {
            pending[row.id] = row.updatedAt;
          }
          set({ pending });
        },

        sessionsChanged: (waiting, uploaded) => {
          // A session that just reached the server counts now, unless the last pull already
          // included it. The next pull replaces this with the server's numbers.
          set({ pendingSessions: waiting, counts: noteUploaded(get().counts, uploaded) });
        },

        reset: () => set({ ...empty, loaded: false, pending: {}, pendingSessions: [], notice: null }),
      };
    },
    {
      name: "pomodoro-tasks",
      // Same reason as the timer store: the server has no localStorage, and the first paint
      // must match the empty state. SyncRoot rehydrates in the browser.
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      // 1: counts became { counts, countedIds }. Older saves held the bare numbers.
      version: 1,
      migrate: (persisted, version) => {
        const saved = (persisted ?? {}) as { counts?: unknown };
        if (version < 1) {
          const counts = saved.counts && typeof saved.counts === "object" ? (saved.counts as Record<string, number>) : {};
          return { ...saved, counts: { counts, countedIds: [] } } as never;
        }
        return saved as never;
      },
      partialize: (state) => ({
        tasks: state.tasks,
        projects: state.projects,
        tags: state.tags,
        counts: state.counts,
        pro: state.pro,
        cursor: state.cursor,
        ownerId: state.ownerId,
      }),
    },
  ),
);
