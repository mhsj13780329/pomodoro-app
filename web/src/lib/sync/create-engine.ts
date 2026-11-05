import { adjustedNow } from "@/lib/timer/remaining";
import type { TaskBatch, TaskBatchResult } from "@/lib/tasks/contract";
import { medianOffset, pushClockSample } from "./clock";
import type { SessionInput } from "./contract";
import { taskQueueSize } from "./db";
import type { QueuedAction, SyncPorts, TimerHandle, TimerOutbound } from "./ports";
import { setSyncView, waitingCountOf } from "./status";

const POLL_MS = 15_000;
const SETTINGS_WAIT_MS = 800;
const RETRY_MS = 2_000;

export type FlushOptions = {
  /** Why the caller wants the queue emptied. Logout is the only reason today. */
  reason: "logout";
};

export type SyncEngine = {
  /**
   * Starts sync for one signed-in user and returns its stop function. Guests never call this, so
   * they never hit the network. Starting again stops the previous run first.
   */
  start: (userId: string) => () => void;
  isActive: () => boolean;
  /** `Date.now()` corrected by the median server clock offset. */
  now: () => number;
  /** Queues a timer command (and the session it finishes) and replays when online. */
  publishTimer: (item: TimerOutbound) => void;
  /**
   * Queues task, project and tag rows for upload. The store has already applied them locally,
   * so the screen never waits for the network. Safe to call when offline.
   */
  publishTasks: (rows: Partial<TaskBatch>) => void;
  /** Settings changed locally: push them after a short pause. */
  settingsChanged: () => void;
  /** Replays the queue through the same path as every other trigger. Returns how many items still wait. */
  flush: (options: FlushOptions) => Promise<number>;
  /** Stops sync, deletes this user's queues and forgets the clock samples. */
  wipe: () => Promise<void>;
};

/**
 * The sync engine. Polling is the stand-in for a later `GET /api/sync/stream` (Server-Sent
 * Events). `pull` stays the one place that adopts a quiet refresh. Every job that touches the
 * queues runs on one serial chain.
 */
export function createSyncEngine({ env, transport, storage, host }: SyncPorts): SyncEngine {
  let active = false;
  let samples: number[] = [];
  let userId: string | null = null;
  let publish: ((item: TimerOutbound) => void) | null = null;
  let publishTasks: ((rows: Partial<TaskBatch>) => void) | null = null;
  let settingsNotify: (() => void) | null = null;
  let flushNow: (() => Promise<number>) | null = null;
  let stopCurrent: (() => void) | null = null;

  function noteClock(serverNow: number, sentAt: number, receivedAt: number, force: boolean) {
    samples = pushClockSample(samples, serverNow - receivedAt, receivedAt - sentAt, force);
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
    onSettled: (sent: TaskBatch, result: TaskBatchResult) => void,
  ): Promise<"ok" | "network" | "blocked"> {
    if (!id) return "ok";
    for (;;) {
      const queue = await storage.readTaskQueue(id);
      if (taskQueueSize(queue) === 0) return "ok";
      const sent: TaskBatch = {
        projects: Object.values(queue.projects).slice(0, 100),
        tags: Object.values(queue.tags).slice(0, 100),
        tasks: Object.values(queue.tasks).slice(0, 100),
      };
      const response = await transport.postTaskBatch(sent);
      if (!response.ok && response.status === 401) return "blocked";
      if (!response.ok && response.network) return "network";

      // Answered (or rejected as malformed, which would never succeed): take the rows off the queue.
      const current = await storage.readTaskQueue(id);
      for (const row of sent.projects) if (current.projects[row.id]?.updatedAt === row.updatedAt) delete current.projects[row.id];
      for (const row of sent.tags) if (current.tags[row.id]?.updatedAt === row.updatedAt) delete current.tags[row.id];
      for (const row of sent.tasks) if (current.tasks[row.id]?.updatedAt === row.updatedAt) delete current.tasks[row.id];
      await storage.writeTaskQueue(id, current);
      if (response.ok) onSettled(sent, response.result);
    }
  }

  function start(nextUserId: string): () => void {
    stopCurrent?.();
    active = true;
    userId = nextUserId;
    samples = [];
    let stopped = false;
    let epoch = 0;
    let primed = false;
    let pollId: TimerHandle = null;
    let settingsTimer: TimerHandle = null;
    let retryTimer: TimerHandle = null;
    let chain: Promise<unknown> = Promise.resolve();

    const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
      const run = chain.then(job, job);
      chain = run;
      return run;
    };

    const countWaiting = async (): Promise<number> => {
      if (!userId) return 0;
      const [actions, sessions, taskRows] = await Promise.all([
        storage.readActions(userId),
        storage.readSessions(userId),
        storage.readTaskQueue(userId),
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
      host.tasks.sessionsChanged(await storage.readSessions(userId), uploaded);
    };

    const refreshStatus = async () => {
      if (!userId) return;
      const waiting = await countWaiting();
      if (!env.isOnline()) {
        setSyncView({ kind: "offline", waiting });
        return;
      }
      setSyncView(waiting > 0 ? { kind: "syncing" } : { kind: "synced" });
    };

    const showWaiting = async (kind: "syncing" | "offline") => {
      if (!userId) return;
      const waiting = await countWaiting();
      if (kind === "offline" || !env.isOnline()) setSyncView({ kind: "offline", waiting });
      else setSyncView({ kind: "syncing" });
    };

    const dropSession = async (sessionId: string | null) => {
      if (!userId || !sessionId) return;
      const sessions = await storage.readSessions(userId);
      await storage.writeSessions(
        userId,
        sessions.filter((session) => session.id !== sessionId),
      );
      await reportSessions();
    };

    const flushSessions = async () => {
      if (!userId || !env.isOnline()) return;
      const sessions = await storage.readSessions(userId);
      if (sessions.length === 0) return;
      const result = await transport.postSessions(sessions.slice(0, 100));
      if (!result.ok) return;
      const done = new Set([
        ...result.result.accepted,
        ...result.result.existing,
        ...result.result.rejected,
      ]);
      const left = (await storage.readSessions(userId)).filter((session) => !done.has(session.id));
      await storage.writeSessions(userId, left);
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

    const scheduleRetry = () => {
      env.clearTimeout(retryTimer);
      retryTimer = env.setTimeout(() => void enqueue(() => replay()), RETRY_MS);
    };

    /** The one replay: task rows, then timer actions in order, then sessions. */
    const replay = async () => {
      if (!userId || stopped) return;
      if (!env.isOnline()) {
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
        const actions = await storage.readActions(userId);
        const item = actions[0];
        if (!item) break;
        const result = await transport.postTimer(item.command);
        if (!result.ok) {
          if (result.network) {
            await showWaiting("offline");
            scheduleRetry();
            return;
          }
          await storage.writeActions(userId, actions.slice(1));
          continue;
        }
        noteClock(result.state.serverNow, result.sentAt, result.receivedAt, result.status === 422);
        if (result.status === 409 || result.status === 422) {
          // The server won. Drop every session that belonged to the actions we are throwing away,
          // so a skipped phase is not saved from this device afterwards.
          const pending = await storage.readActions(userId);
          // A task pick is not a countdown change and never conflicts, so it survives.
          const keep = pending.filter((queued) => queued.command.action === "setTask");
          for (const queued of pending) {
            if (queued.command.action !== "setTask") await dropSession(queued.sessionId);
          }
          await storage.writeActions(userId, keep);
          host.adopt(result.state, {
            timer: true,
            kind: result.status === 422 ? "early" : "conflict",
            keepTask: keep.length > 0,
          });
          if (keep.length > 0) continue;
          break;
        }
        const rest = (await storage.readActions(userId)).filter((queued) => queued.id !== item.id);
        await storage.writeActions(userId, rest);
        if (rest.length === 0) host.adopt(result.state, { timer: true, kind: "ok" });
      }
      await flushSessions();
      primed = true;
      await refreshStatus();
    };

    const pull = async () => {
      if (!userId || stopped) return;
      if (!env.isOnline()) {
        await showWaiting("offline");
        return;
      }
      const queued = await storage.readActions(userId);
      const queuedRows = taskQueueSize(await storage.readTaskQueue(userId));
      if (queued.length > 0 || queuedRows > 0) {
        await replay();
        return;
      }
      if (!primed) setSyncView({ kind: "syncing" });
      const seen = epoch;
      const result = await transport.fetchState(host.tasks.since());
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
      host.applyTheme(result.state.settings.themeId);
      await flushSessions();
      primed = true;
      await refreshStatus();
    };

    const pushSettings = async () => {
      if (!userId || stopped || !env.isOnline()) return;
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
        soundId: snap.soundId,
        focusSoundId: snap.focusSoundId,
        shortBreakSoundId: snap.shortBreakSoundId,
        longBreakSoundId: snap.longBreakSoundId,
        ambientId: snap.ambientId,
        ambientMix: snap.ambientMix,
      };
      const seen = epoch;
      const result = await transport.putSettings(patch);
      if (!result.ok || stopped || seen !== epoch) return;
      noteClock(result.state.serverNow, result.sentAt, result.receivedAt, false);
      const queued = await storage.readActions(userId);
      host.adopt(result.state, { timer: queued.length === 0, kind: "ok" });
      host.applyTheme(result.state.settings.themeId);
      primed = true;
      await refreshStatus();
    };

    const armPoll = () => {
      env.clearInterval(pollId);
      // Replace this interval with Server-Sent Events later. Do not add a second listener.
      pollId = env.setInterval(() => {
        if (env.isVisible()) void enqueue(() => pull());
      }, POLL_MS);
    };

    const onVisible = () => {
      if (!env.isVisible()) {
        env.clearInterval(pollId);
        return;
      }
      void enqueue(() => pull());
      armPoll();
    };
    const onFocus = () => void enqueue(() => pull());
    const onOnline = () => void enqueue(() => replay());
    const onOffline = () => {
      void showWaiting("offline");
    };

    publish = (item) => {
      epoch += 1;
      void enqueue(async () => {
        if (!userId) return;
        const actions = await storage.readActions(userId);
        const queued: QueuedAction = {
          id: env.uuid(),
          command: item.command,
          sessionId: item.session?.id ?? null,
        };
        await storage.writeActions(userId, [...actions, queued]);
        if (item.session) {
          const sessions = await storage.readSessions(userId);
          if (!sessions.some((session) => session.id === item.session?.id)) {
            await storage.writeSessions(userId, [...sessions, item.session]);
          }
          await reportSessions();
        }
        if (!env.isOnline()) {
          await showWaiting("offline");
          return;
        }
        await replay();
      });
    };

    publishTasks = (rows) => {
      // Same reason as publish: a pull that started before this edit must not overwrite it.
      epoch += 1;
      void enqueue(async () => {
        if (!userId) return;
        const queue = await storage.readTaskQueue(userId);
        for (const row of rows.projects ?? []) queue.projects[row.id] = row;
        for (const row of rows.tags ?? []) queue.tags[row.id] = row;
        for (const row of rows.tasks ?? []) queue.tasks[row.id] = row;
        await storage.writeTaskQueue(userId, queue);
        if (!env.isOnline()) {
          await showWaiting("offline");
          return;
        }
        await replay();
      });
    };

    settingsNotify = () => {
      env.clearTimeout(settingsTimer);
      settingsTimer = env.setTimeout(() => void enqueue(() => pushSettings()), SETTINGS_WAIT_MS);
    };

    flushNow = () =>
      enqueue(async () => {
        await replay();
        return countWaiting();
      });

    const unsubscribers = [
      env.onVisibilityChange(onVisible),
      env.onFocus(onFocus),
      env.onOnline(onOnline),
      env.onOffline(onOffline),
    ];
    if (env.isVisible()) armPoll();
    void enqueue(async () => {
      // Rows and sessions that were still waiting when the app closed. The first pull will not
      // overwrite them, and the pomodoro counts include the sessions.
      if (!userId) return;
      host.tasks.setPending(await storage.readTaskQueue(userId));
      await reportSessions();
    });
    void enqueue(() => pull());

    const stop = () => {
      if (stopped) return;
      stopped = true;
      active = false;
      publish = null;
      publishTasks = null;
      settingsNotify = null;
      flushNow = null;
      userId = null;
      env.clearInterval(pollId);
      env.clearTimeout(settingsTimer);
      env.clearTimeout(retryTimer);
      for (const unsubscribe of unsubscribers) unsubscribe();
      setSyncView({ kind: "guest" });
      if (stopCurrent === stop) stopCurrent = null;
    };
    stopCurrent = stop;
    return stop;
  }

  return {
    start,
    isActive: () => active,
    now: () => adjustedNow(env.now(), medianOffset(samples)),
    publishTimer: (item) => publish?.(item),
    publishTasks: (rows) => publishTasks?.(rows),
    settingsChanged: () => {
      if (!active) return;
      settingsNotify?.();
    },
    flush: async () => (flushNow ? flushNow() : 0),
    wipe: async () => {
      const id = userId;
      stopCurrent?.();
      if (id) await storage.clearQueues(id);
      samples = [];
      setSyncView({ kind: "guest" });
    },
  };
}
