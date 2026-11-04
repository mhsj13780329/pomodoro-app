// Fakes for the engine's ports. Used by engine.test.ts; nothing in production imports this file.

import type { TaskBatch } from "@/lib/tasks/contract";
import { countCompletedFocus } from "@/lib/tasks/counts";
import type { SessionsResponse, SyncResponse, TaskBatchResponse } from "./api";
import type { QueuedCommand, SessionInput, SettingsPatch, SyncState } from "./contract";
import { emptyTaskQueue } from "./db";
import type {
  QueuedAction,
  QueuedTaskRows,
  SettingsSnapshot,
  SyncEnv,
  SyncHost,
  SyncStorage,
  SyncTransport,
  TimerHandle,
} from "./ports";

// ---- env -------------------------------------------------------------------------------------

type Scheduled = { fn: () => void; ms: number; repeat: boolean };

/** A controllable environment: flip `online`/`visible`, emit events, fire timers by hand. */
export class FakeEnv implements SyncEnv {
  online = true;
  visible = true;
  time = 1_700_000_000_000;
  private nextId = 1;
  private uuids = 0;
  private scheduled = new Map<number, Scheduled>();
  private listeners = { visibility: new Set<() => void>(), focus: new Set<() => void>(), online: new Set<() => void>(), offline: new Set<() => void>() };

  isOnline = () => this.online;
  isVisible = () => this.visible;
  now = () => this.time;
  uuid = () => `00000000-0000-4000-8000-${String(++this.uuids).padStart(12, "0")}`;

  setTimeout = (fn: () => void, ms: number): TimerHandle => this.add({ fn, ms, repeat: false });
  setInterval = (fn: () => void, ms: number): TimerHandle => this.add({ fn, ms, repeat: true });
  clearTimeout = (handle: TimerHandle) => void this.scheduled.delete(handle as number);
  clearInterval = (handle: TimerHandle) => void this.scheduled.delete(handle as number);

  onVisibilityChange = (fn: () => void) => this.listen(this.listeners.visibility, fn);
  onFocus = (fn: () => void) => this.listen(this.listeners.focus, fn);
  onOnline = (fn: () => void) => this.listen(this.listeners.online, fn);
  onOffline = (fn: () => void) => this.listen(this.listeners.offline, fn);

  /** Delays of the timeouts that have not fired yet. */
  pendingTimeouts(): number[] {
    return [...this.scheduled.values()].filter((item) => !item.repeat).map((item) => item.ms);
  }

  pendingIntervals(): number[] {
    return [...this.scheduled.values()].filter((item) => item.repeat).map((item) => item.ms);
  }

  /** Fires every pending timeout once (they are one-shot, so they are removed first). */
  fireTimeouts() {
    for (const [id, item] of [...this.scheduled]) {
      if (item.repeat) continue;
      this.scheduled.delete(id);
      item.fn();
    }
  }

  fireIntervals() {
    for (const item of [...this.scheduled.values()]) if (item.repeat) item.fn();
  }

  emit(event: keyof FakeEnv["listeners"]) {
    for (const fn of [...this.listeners[event]]) fn();
  }

  listenerCount(): number {
    return Object.values(this.listeners).reduce((sum, set) => sum + set.size, 0);
  }

  private add(item: Scheduled): TimerHandle {
    const id = this.nextId++;
    this.scheduled.set(id, item);
    return id;
  }

  private listen(set: Set<() => void>, fn: () => void) {
    set.add(fn);
    return () => void set.delete(fn);
  }
}

// ---- storage ---------------------------------------------------------------------------------

/** In-memory queues. Values are cloned on the way in and out, like IndexedDB does. */
export function createMemoryStorage(): SyncStorage {
  const actions = new Map<string, QueuedAction[]>();
  const sessions = new Map<string, SessionInput[]>();
  const rows = new Map<string, QueuedTaskRows>();
  return {
    readActions: async (id) => structuredClone(actions.get(id) ?? []),
    writeActions: async (id, value) => void actions.set(id, structuredClone(value)),
    readSessions: async (id) => structuredClone(sessions.get(id) ?? []),
    writeSessions: async (id, value) => void sessions.set(id, structuredClone(value)),
    readTaskQueue: async (id) => structuredClone(rows.get(id) ?? emptyTaskQueue()),
    writeTaskQueue: async (id, value) => void rows.set(id, structuredClone(value)),
    clearQueues: async (id) => {
      actions.delete(id);
      sessions.delete(id);
      rows.delete(id);
    },
  };
}

// ---- transport: a tiny server ----------------------------------------------------------------

export type TimerHook = (command: QueuedCommand) => SyncResponse | undefined;

/**
 * Acts like the real routes in miniature: one ActiveTimer with a version, version-checked
 * commands (setTask is not), idempotent sessions. Hooks can override a single answer.
 */
export class FakeServer implements SyncTransport {
  version = 1;
  taskId: string | null = null;
  settingsUpdatedAt = "2020-01-01T00:00:00.000Z";
  themeId: "warm" | "night" | "forest" = "warm";
  clockSkewMs = 0;
  counts: Record<string, number> = {};
  /** Session ids the server already stores. */
  sessions = new Set<string>();
  /** Everything received, in order, e.g. "tasks", "timer:pause", "sessions:a,b", "fetch", "settings". */
  calls: string[] = [];
  appliedTimer: QueuedCommand[] = [];
  appliedBatches: TaskBatch[] = [];
  /** Answer the next timer posts with this instead of the normal logic (first match wins, then removed). */
  timerHooks: TimerHook[] = [];
  /** Answer a fetch with a promise the test controls. */
  fetchGate: Promise<void> | null = null;
  failTaskBatch: { network: boolean; status: number } | null = null;
  failSessions = false;

  constructor(private readonly env: FakeEnv) {}

  state(): SyncState {
    const now = this.env.now();
    return {
      serverNow: now + this.clockSkewMs,
      settings: {
        focusMin: 25,
        shortBreakMin: 5,
        longBreakMin: 15,
        longBreakEvery: 4,
        autoStartFocus: false,
        autoStartShortBreak: false,
        autoStartLongBreak: false,
        themeId: this.themeId,
        soundId: "bell",
        ambientId: null,
        notificationsOn: false,
        updatedAt: this.settingsUpdatedAt,
      },
      activeTimer: {
        phase: "focus",
        status: "running",
        startedAt: new Date(now).toISOString(),
        plannedSec: 1500,
        pausedAt: null,
        pausedTotalSec: 0,
        cycleIndex: 0,
        taskId: this.taskId,
        version: this.version,
        runId: "run-1",
        updatedAt: new Date(now).toISOString(),
      },
    };
  }

  respond(status: number): SyncResponse {
    const now = this.env.now();
    return { ok: true, status, state: this.state(), sentAt: now, receivedAt: now };
  }

  fetchState = async (tasksSince?: number): Promise<SyncResponse> => {
    this.calls.push("fetch");
    if (this.fetchGate) await this.fetchGate;
    const response = this.respond(200);
    if (response.ok && tasksSince !== undefined) {
      response.state.tasks = {
        cursor: this.env.now(),
        full: tasksSince === 0,
        projects: [],
        tags: [],
        tasks: [],
        counts: { ...this.counts },
        pro: false,
      };
    }
    return response;
  };

  putSettings = async (patch: SettingsPatch): Promise<SyncResponse> => {
    this.calls.push("settings");
    this.settingsUpdatedAt = patch.clientUpdatedAt;
    if (patch.themeId) this.themeId = patch.themeId;
    return this.respond(200);
  };

  postTimer = async (command: QueuedCommand): Promise<SyncResponse> => {
    this.calls.push(`timer:${command.action}`);
    const hook = this.timerHooks.shift();
    const hooked = hook?.(command);
    if (hooked) return hooked;
    if (command.action === "setTask") {
      this.taskId = command.taskId;
    } else if (command.expectedVersion !== this.version) {
      return this.respond(409);
    } else {
      this.version += 1;
    }
    this.appliedTimer.push(command);
    return this.respond(200);
  };

  postSessions = async (sessions: SessionInput[]): Promise<SessionsResponse> => {
    this.calls.push(`sessions:${sessions.map((session) => session.id).join(",")}`);
    if (this.failSessions) return { ok: false, network: true };
    const accepted: string[] = [];
    const existing: string[] = [];
    for (const session of sessions) {
      if (this.sessions.has(session.id)) existing.push(session.id);
      else {
        this.sessions.add(session.id);
        accepted.push(session.id);
      }
    }
    return { ok: true, result: { serverNow: this.env.now(), accepted, existing, rejected: [] } };
  };

  postTaskBatch = async (batch: TaskBatch): Promise<TaskBatchResponse> => {
    this.calls.push("tasks");
    if (this.failTaskBatch) return { ok: false, ...this.failTaskBatch };
    this.appliedBatches.push(batch);
    const results = [
      ...batch.projects.map((row) => ({ kind: "project" as const, id: row.id, status: "applied" as const })),
      ...batch.tags.map((row) => ({ kind: "tag" as const, id: row.id, status: "applied" as const })),
      ...batch.tasks.map((row) => ({ kind: "task" as const, id: row.id, status: "applied" as const })),
    ];
    return {
      ok: true,
      result: { serverNow: this.env.now(), results, rows: { projects: [], tags: [], tasks: [] }, pro: false },
    };
  };
}

// ---- host ------------------------------------------------------------------------------------

type AdoptOptions = Parameters<SyncHost["adopt"]>[1];

/**
 * Records what the engine tells the app. `counts` follows the tasks store's rules: a pull
 * replaces them with the server's, and sessionsChanged adds the sessions that just uploaded.
 */
export class FakeHost implements SyncHost {
  adopted: { state: SyncState; options: AdoptOptions }[] = [];
  themes: string[] = [];
  settled: unknown[] = [];
  pending: QueuedTaskRows[] = [];
  waitingSessions: SessionInput[] = [];
  counts: Record<string, number> = {};
  cursor = 0;
  settings: SettingsSnapshot = {
    settingsUpdatedAt: 0,
    focusMin: 25,
    shortBreakMin: 5,
    longBreakMin: 15,
    longBreakEvery: 4,
    autoStartFocus: false,
    autoStartShortBreak: false,
    autoStartLongBreak: false,
    themeId: "warm",
  };

  snapshot = () => this.settings;
  adopt: SyncHost["adopt"] = (state, options) => void this.adopted.push({ state, options });
  applyTheme = (themeId: string) => void this.themes.push(themeId);
  tasks: SyncHost["tasks"] = {
    since: () => this.cursor,
    adopt: (block) => {
      this.counts = { ...block.counts };
      this.cursor = block.cursor;
    },
    settle: (sent, result) => void this.settled.push({ sent, result }),
    setPending: (queue) => void this.pending.push(queue),
    sessionsChanged: (waiting, uploaded) => {
      this.waitingSessions = waiting;
      for (const [taskId, extra] of Object.entries(countCompletedFocus(uploaded))) {
        this.counts[taskId] = (this.counts[taskId] ?? 0) + extra;
      }
    },
  };

  kinds(): string[] {
    return this.adopted.map((item) => item.options.kind);
  }
}
