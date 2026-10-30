import { adjustedNow } from "@/lib/timer/remaining";
import { applyTheme, type ThemeId } from "@/features/settings/theme";
import { fetchState, postSessions, postTimer, putSettings } from "./api";
import { medianOffset, pushClockSample } from "./clock";
import type { SessionInput, SyncState, TimerCommand } from "./contract";
import { clearQueues, readActions, readSessions, writeActions, writeSessions, type QueuedAction } from "./db";
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

export type SyncHost = {
  snapshot: () => SettingsSnapshot;
  adopt: (state: SyncState, options: { timer: boolean; kind: "ok" | "conflict" | "early" | "pull" }) => void;
};

export type TimerOutbound = {
  command: TimerCommand;
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

  const refreshStatus = async () => {
    if (!userId) return;
    const [actions, sessions] = await Promise.all([readActions(userId), readSessions(userId)]);
    const waiting = waitingCountOf(
      actions.map((item) => item.command),
      sessions,
    );
    if (!navigator.onLine) {
      setSyncView({ kind: "offline", waiting });
      return;
    }
    setSyncView(waiting > 0 ? { kind: "syncing" } : { kind: "synced" });
  };

  const showWaiting = async (kind: "syncing" | "offline") => {
    if (!userId) return;
    const [actions, sessions] = await Promise.all([readActions(userId), readSessions(userId)]);
    const waiting = waitingCountOf(
      actions.map((item) => item.command),
      sessions,
    );
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
  };

  const replay = async () => {
    if (!userId || stopped) return;
    if (!navigator.onLine) {
      await showWaiting("offline");
      return;
    }
    await showWaiting("syncing");
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
        for (const queued of pending) await dropSession(queued.sessionId);
        await writeActions(userId, []);
        host.adopt(result.state, {
          timer: true,
          kind: result.status === 422 ? "early" : "conflict",
        });
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
    if (queued.length > 0) {
      await replay();
      return;
    }
    if (!primed) setSyncView({ kind: "syncing" });
    const seen = epoch;
    const result = await fetchState();
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
      }
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
  enqueue(() => pull());

  const stop = () => {
    if (stopped) return;
    stopped = true;
    active = false;
    publish = null;
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
  const [actions, sessions] = await Promise.all([readActions(id), readSessions(id)]);
  return waitingCountOf(
    actions.map((item) => item.command),
    sessions,
  );
}

export async function wipeDevice(): Promise<void> {
  const id = userId;
  stopCurrent?.();
  if (id) await clearQueues(id);
  samples = [];
  setSyncView({ kind: "guest" });
}

