// One shared fetch for the streak chip, the today panel and the stats page.
// The last good response stays in memory so a dropped network does not blank the numbers.
// A session that just uploaded is kept until the next response includes its id.

import type { StatSession } from "@/lib/stats/aggregate";
import { mergeById } from "@/lib/stats/aggregate";
import { calendarForLocale, civilKey, civilToday, startOfCalendarMonth, validTimeZone } from "@/lib/stats/calendar";
import type { StatsResponse } from "@/lib/stats/contract";
import { freeWindow } from "@/lib/stats/range";

export type RemoteStats = {
  status: "loading" | "ready" | "offline";
  snapshot: StatsResponse | null;
  offline: boolean;
  handedOff: StatSession[];
  /** A Pro range (another month, a year, or the breakdown). Null while it is loading. */
  view: StatsResponse | null;
  viewKey: string;
};

const INITIAL: RemoteStats = {
  status: "loading",
  snapshot: null,
  offline: false,
  handedOff: [],
  view: null,
  viewKey: "",
};

let state: RemoteStats = INITIAL;
const listeners = new Set<() => void>();
let previousPending: StatSession[] = [];
let holders = 0;
let poll: ReturnType<typeof setInterval> | null = null;
let stopWatch: (() => void) | null = null;
let watch: { timeZone: string; locale: string; userId: string } | null = null;
let viewRequest: { from: string; to: string; locale: string; breakdown: boolean } | null = null;
let nowMs = 0;
let clockStarted = false;

const POLL_MS = 15_000;

function emit(next: RemoteStats) {
  state = next;
  for (const listener of listeners) listener();
}

/** Ticked from outside render. The streak's "today" must not call Date.now() while drawing. */
function ensureClock() {
  if (clockStarted || typeof window === "undefined") return;
  clockStarted = true;
  nowMs = Date.now();
  setInterval(() => {
    nowMs = Date.now();
    for (const listener of listeners) listener();
  }, 60_000);
}

export function getNow(): number {
  return nowMs;
}

export function subscribeStats(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStatsState(): RemoteStats {
  ensureClock();
  return state;
}

export function getServerStats(): RemoteStats {
  return INITIAL;
}

/** Sessions that left the upload queue but are not in the last response yet. */
export function notePending(pending: readonly StatSession[]) {
  const ids = new Set(pending.map((session) => session.id));
  const serverIds = new Set(state.snapshot?.sessions.map((session) => session.id) ?? []);
  const dropped = previousPending.filter((session) => !ids.has(session.id) && !serverIds.has(session.id));
  previousPending = [...pending];
  const handedOff = mergeById(
    state.handedOff.filter((session) => !serverIds.has(session.id) && !ids.has(session.id)),
    dropped,
  );
  const same =
    handedOff.length === state.handedOff.length && handedOff.every((session, index) => session.id === state.handedOff[index]?.id);
  if (!same) emit({ ...state, handedOff });
}

export async function refreshStats(): Promise<void> {
  const current = watch;
  if (!current) return;
  const timeZone = validTimeZone(current.timeZone);
  const now = new Date();
  const today = civilToday(now, timeZone);
  const monthStart = civilKey(startOfCalendarMonth(now, timeZone, calendarForLocale(current.locale)));
  const window = freeWindow(today, monthStart);
  if (!window) return;
  const params = new URLSearchParams({ from: window.from, to: window.to, locale: current.locale });
  try {
    const response = await fetch(`/api/stats?${params}`, { cache: "no-store" });
    if (watch?.userId !== current.userId) return;
    if (!response.ok) {
      emit({
        ...state,
        offline: true,
        status: state.snapshot ? "ready" : "offline",
      });
      return;
    }
    const snapshot = (await response.json()) as StatsResponse;
    if (watch?.userId !== current.userId) return;
    const serverIds = new Set(snapshot.sessions.map((session) => session.id));
    emit({
      status: "ready",
      snapshot,
      offline: false,
      handedOff: state.handedOff.filter((session) => !serverIds.has(session.id)),
      view: state.view,
      viewKey: state.viewKey,
    });
  } catch {
    if (watch?.userId !== current.userId) return;
    emit({
      ...state,
      offline: true,
      status: state.snapshot ? "ready" : "offline",
    });
  }
  if (viewRequest) void loadView(viewKey(viewRequest));
}

function viewKey(request: { from: string; to: string; locale: string; breakdown: boolean }): string {
  return `${request.locale}:${request.from}:${request.to}:${request.breakdown ? "1" : "0"}`;
}

/** Ask for a range outside the free window, or for the breakdown. Pass null to drop it. */
export function setStatsView(request: { from: string; to: string; locale: string; breakdown: boolean } | null) {
  if (!request) {
    viewRequest = null;
    if (state.view || state.viewKey) emit({ ...state, view: null, viewKey: "" });
    return;
  }
  const key = viewKey(request);
  viewRequest = request;
  if (state.viewKey !== key) void loadView(key);
}

async function loadView(key: string) {
  const request = viewRequest;
  if (!request || viewKey(request) !== key) return;
  const params = new URLSearchParams({ from: request.from, to: request.to, locale: request.locale });
  if (request.breakdown) params.set("breakdown", "1");
  try {
    const response = await fetch(`/api/stats?${params}`, { cache: "no-store" });
    if (!viewRequest || viewKey(viewRequest) !== key) return;
    if (!response.ok) {
      emit({ ...state, view: null, viewKey: key });
      return;
    }
    const view = (await response.json()) as StatsResponse;
    if (!viewRequest || viewKey(viewRequest) !== key) return;
    emit({ ...state, view, viewKey: key });
  } catch {
    if (!viewRequest || viewKey(viewRequest) !== key) return;
  }
}

function startWatch() {
  const onVisible = () => {
    if (document.visibilityState === "visible") void refreshStats();
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onVisible);
  poll = setInterval(() => {
    if (document.visibilityState === "visible") void refreshStats();
  }, POLL_MS);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onVisible);
    if (poll) clearInterval(poll);
    poll = null;
  };
}

/** The chip and the today panel both call this. One poll serves both. */
export function retainStats(next: { timeZone: string; locale: string; userId: string }): () => void {
  const changed = watch?.userId !== next.userId || watch.locale !== next.locale || watch.timeZone !== next.timeZone;
  watch = next;
  holders += 1;
  if (holders === 1) stopWatch = startWatch();
  if (changed || holders === 1) void refreshStats();
  return () => {
    holders -= 1;
    if (holders === 0) {
      stopWatch?.();
      stopWatch = null;
      watch = null;
      previousPending = [];
      emit(INITIAL);
    }
  };
}
