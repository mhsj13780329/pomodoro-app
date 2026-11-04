// The seams of the sync engine. The engine knows only these types: production wires the browser
// adapters (env.ts, api.ts, db.ts), and tests wire the fakes in fakes.ts.

import type { TaskBatch, TaskBatchResult, TasksBlock } from "@/lib/tasks/contract";
import type { SessionsResponse, SyncResponse, TaskBatchResponse } from "./api";
import type { QueuedCommand, SessionInput, SettingsPatch, SyncState } from "./contract";
import type { QueuedAction, QueuedTaskRows } from "./db";

export type { QueuedAction, QueuedTaskRows };

/** Opaque handle returned by a timer. */
export type TimerHandle = unknown;

/** Everything the engine reads from the environment. Subscribe functions return an unsubscribe. */
export type SyncEnv = {
  isOnline: () => boolean;
  isVisible: () => boolean;
  /** Epoch milliseconds, uncorrected by the server clock offset. */
  now: () => number;
  uuid: () => string;
  setTimeout: (fn: () => void, ms: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
  setInterval: (fn: () => void, ms: number) => TimerHandle;
  clearInterval: (handle: TimerHandle) => void;
  onVisibilityChange: (fn: () => void) => () => void;
  onFocus: (fn: () => void) => () => void;
  onOnline: (fn: () => void) => () => void;
  onOffline: (fn: () => void) => () => void;
};

/** The calls the engine makes to the server. */
export type SyncTransport = {
  fetchState: (tasksSince?: number) => Promise<SyncResponse>;
  putSettings: (patch: SettingsPatch) => Promise<SyncResponse>;
  postTimer: (command: QueuedCommand) => Promise<SyncResponse>;
  postSessions: (sessions: SessionInput[]) => Promise<SessionsResponse>;
  postTaskBatch: (batch: TaskBatch) => Promise<TaskBatchResponse>;
};

/** The durable queues, one set per user. */
export type SyncStorage = {
  readActions: (userId: string) => Promise<QueuedAction[]>;
  writeActions: (userId: string, actions: QueuedAction[]) => Promise<void>;
  readSessions: (userId: string) => Promise<SessionInput[]>;
  writeSessions: (userId: string, sessions: SessionInput[]) => Promise<void>;
  readTaskQueue: (userId: string) => Promise<QueuedTaskRows>;
  writeTaskQueue: (userId: string, queue: QueuedTaskRows) => Promise<void>;
  clearQueues: (userId: string) => Promise<void>;
};

export type SettingsSnapshot = {
  settingsUpdatedAt: number;
  focusMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  longBreakEvery: number;
  autoStartFocus: boolean;
  autoStartShortBreak: boolean;
  autoStartLongBreak: boolean;
  themeId: NonNullable<SettingsPatch["themeId"]>;
};

/** The part of the sync host that belongs to the tasks store. */
export type TasksHost = {
  /** Cursor for the next pull. 0 means "send me everything". */
  since: () => number;
  /** Folds the tasks block of a pull into the store. */
  adopt: (block: TasksBlock) => void;
  /** Applies the server's answer to one flush of queued rows. */
  settle: (sent: TaskBatch, result: TaskBatchResult) => void;
  /** Tells the store which rows are still waiting in the queue (read once at start). */
  setPending: (queue: QueuedTaskRows) => void;
  /** Focus sessions still waiting to upload, plus the ones that just went up (for the counts). */
  sessionsChanged: (waiting: SessionInput[], uploaded: SessionInput[]) => void;
};

/** What the engine calls back into the app. */
export type SyncHost = {
  snapshot: () => SettingsSnapshot;
  adopt: (
    state: SyncState,
    options: { timer: boolean; kind: "ok" | "conflict" | "early" | "pull"; keepTask?: boolean },
  ) => void;
  /** Applies the theme the server holds. */
  applyTheme: (themeId: string) => void;
  tasks: TasksHost;
};

export type SyncPorts = {
  env: SyncEnv;
  transport: SyncTransport;
  storage: SyncStorage;
  host: SyncHost;
};

export type TimerOutbound = {
  command: QueuedCommand;
  session: SessionInput | null;
};
