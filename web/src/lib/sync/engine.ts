import { adjustedNow } from "@/lib/timer/remaining";
import { applyTheme, type ThemeId } from "@/features/settings/theme";
import type { TaskBatch, TaskBatchResult, TasksBlock } from "@/lib/tasks/contract";
import { fetchState, postSessions, postTaskBatch, postTimer, putSettings } from "./api";
import { medianOffset, pushClockSample } from "./clock";
import type { QueuedCommand, SessionInput, SyncState } from "./contract";
import {
  clearQueues,
  readActions,
  readSessions,
  readTaskQueue,
  taskQueueSize,
  writeActions,
  writeSessions,
  writeTaskQueue,
  type QueuedAction,
  type QueuedTaskRows,
} from "./db";
import { setSyncView, waitingCountOf } from "./status";

const POLL_MS = 15_000;
const SETTINGS_WAIT_MS = 800;

export type SettingsSnapshot = {
  settingsUpdatedAt: number;
  focusMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  longBreakEvery: number;
  autoStartFocus: boolean;
  autoStartShortBreak: boolean;
  autoStartLongBreak: boolean;
  themeId: ThemeId;
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

export type SyncHost = {
  snapshot: () => SettingsSnapshot;
  adopt: (
    state: SyncState,
    options: { timer: boolean; kind: "ok" | "conflict" | "early" | "pull"; keepTask?: boolean },
  ) => void;
  tasks: TasksHost;
};

export type TimerOutbound = {
  command: QueuedCommand;
  session: SessionInput | null;
};

let active = false;
let samples: number[] = [];
let publish: ((item: TimerOutbound) => void) | null = null;
let stopCurrent: (() => void) | null = null;
let userId: string | null = null;

export function syncIsActive(): boolean {
  return active;
}

export function syncNow(): number {
  return adjustedNow(Date.now(), medianOffset(samples));
}

export function publishTimerCommand(item: TimerOutbound) {
  publish?.(item);
}

export function settingsChanged() {
  if (!active) return;
  settingsNotify?.();
}

/**
 * Queues task, project and tag rows for upload. The store has already applied them locally,
 * so the screen never waits for the network. Safe to call when offline: they wait in IndexedDB.
 */
export function publishTaskWrites(rows: Partial<TaskBatch>) {
  publishTasks?.(rows);
}

let publishTasks: ((rows: Partial<TaskBatch>) => void) | null = null;

let settingsNotify: (() => void) | null = null;

function noteClock(serverNow: number, sentAt: number, receivedAt: number, force: boolean) {
  const offset = serverNow - receivedAt;
  samples = pushClockSample(samples, offset, receivedAt - sentAt, force);
}

/**
 * Starts sync for one signed-in user. Guests never call this, so they never
 * hit the network. Polling is the stand-in for a later `GET /api/sync/stream`
 * (Server-Sent Events). `pull` stays the one place that adopts a quiet refresh.
 */
export function startSync(nextUserId: string, host: SyncHost): () => void {
  stopCurrent?.();
  active = true;
  userId = nextUserId;
  samples = [];
  let stopped = false;
  let epoch = 0;
  let primed = false;
  let pollId = 0;
  let settingsTimer = 0;
  let retryTimer = 0;
  let chain = Promise.resolve();

  const enqueue = (job: () => Promise<void>) => {
    chain = chain.then(job, job);
  };

  const countWaiting = async (): Promise<number> => {
    if (!userId) return 0;
    const [actions, sessions, taskRows] = await Promise.all([
      readActions(userId),
      readSessions(userId),
      readTaskQueue(userId),
    ]);
    return waitingCountOf(
      actions.map((item) => item.command),
      sessions,
      taskQueueSize(taskRows),
    );
  };

  /** The store shows waiting sessions in its pomodoro counts, so keep it told. */
  const reportSessions = async (uploaded: SessionInput[] = []) => {
    if (!userId) return;
    host.tasks.sessionsChanged(await readSessions(userId), uploaded);
  };

  const refreshStatus = async () => {
    if (!userId) return;
    const waiting = await countWaiting();
    if (!navigator.onLine) {
      setSyncView({ kind: "offline", waiting });
      return;
    }
    setSyncView(waiting > 0 ? { kind: "syncing" } : { kind: "synced" });
  };

  const showWaiting = async (kind: "syncing" | "offline") => {
    if (!userId) return;
    const waiting = await countWaiting();
    if (kind === "offline" || !navigator.onLine) setSyncView({ kind: "offline", waiting });
    else setSyncView({ kind: "syncing" });
  };

  const dropSession = async (sessionId: string | null) => {
    if (!userId || !sessionId) return;
    const sessions = await readSessions(userId);
    await writeSessions(
      userId,
      sessions.filter((session) => session.id !== sessionId),
    );
    await reportSessions();
  };

  const flushSessions = async () => {
    if (!userId || !navigator.onLine) return;
    const sessions = await readSessions(userId);
    if (sessions.length === 0) return;
    const result = await postSessions(sessions.slice(0, 100));
    if (!result.ok) return;
    const done = new Set([
      ...result.result.accepted,
      ...result.result.existing,
      ...result.result.rejected,
    ]);
    const left = (await readSessions(userId)).filter((session) => !done.has(session.id));
    await writeSessions(userId, left);
    // Accepted and "existing" both mean the server now has the session (a finished focus is
    // stored with the timer's complete, so the flush then reports it as existing).
    const stored = new Set([...result.result.accepted, ...result.result.existing]);
    host.tasks.sessionsChanged(
      left,
      sessions.filter((session) => stored.has(session.id)),
    );
  };

  /** Uploads queued task rows. Runs before the timer actions so a pick never points at a task the server lacks. */
  const flushTasks = () => sendTaskQueue(userId, (sent, result) => host.tasks.settle(sent, result));

  const replay = async () => {
    if (!userId || stopped) return;
    if (!navigator.onLine) {
      await showWaiting("offline");
      return;
    }
    await showWaiting("syncing");
    if ((await flushTasks()) === "network") {
      await showWaiting("offline");
      scheduleRetry();
      return;
    }
    while (!stopped && userId) {
      const actions = await readActions(userId);
      const item = actions[0];
      if (!item) break;
      const result = await postTimer(item.command);
      if (!result.ok) {
        if (result.network) {
          await showWaiting("offline");
          scheduleRetry();
          return;
        }
        await writeActions(userId, actions.slice(1));
        continue;
      }
      noteClock(result.state.serverNow, result.sentAt, result.receivedAt, result.status === 422);
      if (result.status === 409 || result.status === 422) {
        // The server won. Drop every session that belonged to the actions we are throwing away,
        // so a skipped phase is not saved from this device afterwards.
        const pending = await readActions(userId);
        // A task pick is not a countdown change and never conflicts, so it survives.
        const keep = pending.filter((queued) => queued.command.action === "setTask");
        for (const queued of pending) {
          if (queued.command.action !== "setTask") await dropSession(queued.sessionId);
        }
        await writeActions(userId, keep);
        host.adopt(result.state, {
          timer: true,
          kind: result.status === 422 ? "early" : "conflict",
          keepTask: keep.length > 0,
        });
        if (keep.length > 0) continue;
        break;
      }
      const rest = (await readActions(userId)).filter((queued) => queued.id !== item.id);
      await writeActions(userId, rest);
      if (rest.length === 0) host.adopt(result.state, { timer: true, kind: "ok" });
    }
    await flushSessions();
    primed = true;
    await refreshStatus();
  };

  const pull = async () => {
    if (!userId || stopped) return;
    if (!navigator.onLine) {
      await showWaiting("offline");
      return;
    }
    const queued = await readActions(userId);
    const queuedRows = taskQueueSize(await readTaskQueue(userId));
    if (queued.length > 0 || queuedRows > 0) {
      await replay();
      return;
    }
    if (!primed) setSyncView({ kind: "syncing" });
    const seen = epoch;
    const result = await fetchState(host.tasks.since());
    if (stopped || seen !== epoch) return;
    if (!result.ok) {
      if (result.network) await showWaiting("offline");
      return;
    }
    noteClock(result.state.serverNow, result.sentAt, result.receivedAt, false);
    const local = host.snapshot();
    const serverStamp = Date.parse(result.state.settings.updatedAt);
    if (local.settingsUpdatedAt > serverStamp) {
      await pushSettings();
      return;
    }
    if (seen !== epoch) return;
    host.adopt(result.state, { timer: true, kind: "pull" });
    if (result.state.tasks) host.tasks.adopt(result.state.tasks);
    applyTheme(result.state.settings.themeId);
    await flushSessions();
    primed = true;
    await refreshStatus();
  };

  const pushSettings = async () => {
    if (!userId || stopped || !navigator.onLine) return;
    const snap = host.snapshot();
    if (!(snap.settingsUpdatedAt > 0)) return;
    const patch = {
      clientUpdatedAt: new Date(snap.settingsUpdatedAt).toISOString(),
      focusMin: snap.focusMin,
      shortBreakMin: snap.shortBreakMin,
      longBreakMin: snap.longBreakMin,
      longBreakEvery: snap.longBreakEvery,
      autoStartFocus: snap.autoStartFocus,
      autoStartShortBreak: snap.autoStartShortBreak,
      autoStartLongBreak: snap.autoStartLongBreak,
      themeId: snap.themeId,
    };
    const seen = epoch;
    const result = await putSettings(patch);
    if (!result.ok || stopped || seen !== epoch) return;
    noteClock(result.state.serverNow, result.sentAt, result.receivedAt, false);
    const queued = await readActions(userId);
    host.adopt(result.state, { timer: queued.length === 0, kind: "ok" });
    applyTheme(result.state.settings.themeId);
    primed = true;
    await refreshStatus();
  };

  const scheduleRetry = () => {
    window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(() => enqueue(() => replay()), 2_000);
  };

  const armPoll = () => {
    window.clearInterval(pollId);
    // Replace this interval with Server-Sent Events later. Do not add a second listener.
    pollId = window.setInterval(() => {
      if (document.visibilityState === "visible") enqueue(() => pull());
    }, POLL_MS);
  };

  const onVisible = () => {
    if (document.visibilityState === "hidden") {
      window.clearInterval(pollId);
      return;
    }
    enqueue(() => pull());
    armPoll();
  };
  const onFocus = () => enqueue(() => pull());
  const onOnline = () => enqueue(() => replay());
  const onOffline = () => {
    void showWaiting("offline");
  };

  publish = (item) => {
    epoch += 1;
    enqueue(async () => {
      if (!userId) return;
      const actions = await readActions(userId);
      const queued: QueuedAction = {
        id: crypto.randomUUID(),
        command: item.command,
        sessionId: item.session?.id ?? null,
      };
      await writeActions(userId, [...actions, queued]);
      if (item.session) {
        const sessions = await readSessions(userId);
        if (!sessions.some((session) => session.id === item.session?.id)) {
          await writeSessions(userId, [...sessions, item.session]);
        }
        await reportSessions();
      }
      if (!navigator.onLine) {
        await showWaiting("offline");
        return;
      }
      await replay();
    });
  };

  publishTasks = (rows) => {
    // Same reason as publish: a pull that started before this edit must not overwrite it.
    epoch += 1;
    enqueue(async () => {
      if (!userId) return;
      const queue = await readTaskQueue(userId);
      for (const row of rows.projects ?? []) queue.projects[row.id] = row;
      for (const row of rows.tags ?? []) queue.tags[row.id] = row;
      for (const row of rows.tasks ?? []) queue.tasks[row.id] = row;
      await writeTaskQueue(userId, queue);
      if (!navigator.onLine) {
        await showWaiting("offline");
        return;
      }
      await replay();
    });
  };

  settingsNotify = () => {
    window.clearTimeout(settingsTimer);
    settingsTimer = window.setTimeout(() => enqueue(() => pushSettings()), SETTINGS_WAIT_MS);
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  if (document.visibilityState === "visible") armPoll();
  enqueue(async () => {
    // Rows and sessions that were still waiting when the app closed. The first pull will not
    // overwrite them, and the pomodoro counts include the sessions.
    if (!userId) return;
    host.tasks.setPending(await readTaskQueue(userId));
    await reportSessions();
  });
  enqueue(() => pull());

  const stop = () => {
    if (stopped) return;
    stopped = true;
    active = false;
    publish = null;
    publishTasks = null;
    settingsNotify = null;
    userId = null;
    window.clearInterval(pollId);
    window.clearTimeout(settingsTimer);
    window.clearTimeout(retryTimer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    setSyncView({ kind: "guest" });
    if (stopCurrent === stop) stopCurrent = null;
  };
  stopCurrent = stop;
  return stop;
}

export async function flushForLogout(): Promise<number> {
  if (!userId) return 0;
  const id = userId;
  if (navigator.onLine) {
    await sendTaskQueue(id);
    const actions = await readActions(id);
    for (const item of actions) {
      const result = await postTimer(item.command);
      if (!result.ok) break;
      if (result.status === 409 || result.status === 422) {
        const pending = await readActions(id);
        const dropIds = new Set(pending.flatMap((queued) => (queued.sessionId ? [queued.sessionId] : [])));
        if (dropIds.size > 0) {
          const sessions = await readSessions(id);
          await writeSessions(
            id,
            sessions.filter((session) => !dropIds.has(session.id)),
          );
        }
        await writeActions(id, []);
        break;
      }
      const rest = (await readActions(id)).filter((queued) => queued.id !== item.id);
      await writeActions(id, rest);
    }
    const sessions = await readSessions(id);
    if (sessions.length > 0) {
      const result = await postSessions(sessions.slice(0, 100));
      if (result.ok) {
        const done = new Set([
          ...result.result.accepted,
          ...result.result.existing,
          ...result.result.rejected,
        ]);
        await writeSessions(
          id,
          sessions.filter((session) => !done.has(session.id)),
        );
      }
    }
  }
  const [actions, sessions, taskRows] = await Promise.all([readActions(id), readSessions(id), readTaskQueue(id)]);
  return waitingCountOf(
    actions.map((item) => item.command),
    sessions,
    taskQueueSize(taskRows),
  );
}

/**
 * Uploads every queued task, project and tag row, 100 of each kind at a time.
 * ok      - the queue is empty (or this user has none).
 * network - the server could not be reached; the rows stay queued and a retry follows.
 * blocked - the server refused the request itself (signed out); the rows stay queued, no retry loop.
 * A row is removed from the queue only if it has not been edited again while the request was in flight.
 */
async function sendTaskQueue(
  id: string | null,
  onSettled?: (sent: TaskBatch, result: TaskBatchResult) => void,
): Promise<"ok" | "network" | "blocked"> {
  if (!id) return "ok";
  for (;;) {
    const queue = await readTaskQueue(id);
    if (taskQueueSize(queue) === 0) return "ok";
    const sent: TaskBatch = {
      projects: Object.values(queue.projects).slice(0, 100),
      tags: Object.values(queue.tags).slice(0, 100),
      tasks: Object.values(queue.tasks).slice(0, 100),
    };
    const response = await postTaskBatch(sent);
    if (!response.ok && response.status === 401) return "blocked";
    if (!response.ok && response.network) return "network";

    // Answered (or rejected as malformed, which would never succeed): take the rows off the queue.
    const current = await readTaskQueue(id);
    for (const row of sent.projects) if (current.projects[row.id]?.updatedAt === row.updatedAt) delete current.projects[row.id];
    for (const row of sent.tags) if (current.tags[row.id]?.updatedAt === row.updatedAt) delete current.tags[row.id];
    for (const row of sent.tasks) if (current.tasks[row.id]?.updatedAt === row.updatedAt) delete current.tasks[row.id];
    await writeTaskQueue(id, current);
    if (response.ok) onSettled?.(sent, response.result);
  }
}

export async function wipeDevice(): Promise<void> {
  const id = userId;
  stopCurrent?.();
  if (id) await clearQueues(id);
  samples = [];
  setSyncView({ kind: "guest" });
}

