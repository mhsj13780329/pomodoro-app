// Turns a server payload, plus sessions still on this device, into the numbers
// the timer chip and the stats page show. Guests never call the server.

import { foldStats, type StatSession } from "@/lib/stats/aggregate";
import { civilToday, validTimeZone } from "@/lib/stats/calendar";
import type { StatsResponse } from "@/lib/stats/contract";

export type FocusView = {
  /** `loading` until we know the numbers. Zeros are only for a real empty history. */
  status: "loading" | "ready" | "offline";
  offline: boolean;
  pro: boolean;
  timeZone: string;
  today: string;
  from: string;
  to: string;
  todayFocusSec: number;
  todaySessions: number;
  currentStreak: number;
  bestStreak: number;
  byDay: Map<string, { key: string; focusSec: number; sessions: number }>;
  sessions: StatSession[];
};

const EMPTY_DAYS = new Map<string, { key: string; focusSec: number; sessions: number }>();

function loadingView(timeZone: string): FocusView {
  return {
    status: "loading",
    offline: false,
    pro: false,
    timeZone,
    today: "",
    from: "",
    to: "",
    todayFocusSec: 0,
    todaySessions: 0,
    currentStreak: 0,
    bestStreak: 0,
    byDay: EMPTY_DAYS,
    sessions: [],
  };
}

export function presentFocus(input: {
  signedIn: boolean;
  sessionPending: boolean;
  timeZone: string;
  now: number;
  snapshot: StatsResponse | null;
  offline: boolean;
  pending: readonly StatSession[];
  handedOff: readonly StatSession[];
  guestSessions: readonly StatSession[];
}): FocusView {
  if (input.sessionPending) return loadingView(input.timeZone);
  const timeZone = validTimeZone(input.snapshot?.timezone ?? input.timeZone);
  const today = civilToday(new Date(input.now), timeZone);

  if (!input.signedIn) {
    const folded = foldStats({
      serverSessions: input.guestSessions,
      pending: [],
      streakDatesBeforeRange: [],
      serverBest: 0,
      today,
      timeZone,
    });
    const day = folded.byDay.get(today);
    return {
      status: "ready",
      offline: false,
      pro: false,
      timeZone,
      today,
      from: today,
      to: today,
      todayFocusSec: day?.focusSec ?? 0,
      todaySessions: day?.sessions ?? 0,
      currentStreak: folded.currentStreak,
      bestStreak: folded.bestStreak,
      byDay: folded.byDay,
      sessions: folded.sessions,
    };
  }

  if (!input.snapshot) {
    if (!input.offline) return loadingView(timeZone);
    const folded = foldStats({
      serverSessions: [],
      pending: input.pending,
      handedOff: input.handedOff,
      streakDatesBeforeRange: [],
      serverBest: 0,
      today,
      timeZone,
    });
    const day = folded.byDay.get(today);
    return {
      status: "offline",
      offline: true,
      pro: false,
      timeZone,
      today,
      from: today,
      to: today,
      todayFocusSec: day?.focusSec ?? 0,
      todaySessions: day?.sessions ?? 0,
      currentStreak: folded.currentStreak,
      bestStreak: folded.bestStreak,
      byDay: folded.byDay,
      sessions: folded.sessions,
    };
  }

  const serverSessions: StatSession[] = input.snapshot.sessions.map((session) => ({
    id: session.id,
    startedAt: Date.parse(session.startedAt),
    endedAt: Date.parse(session.endedAt),
    durationSec: session.durationSec,
    phase: "focus",
    completed: true,
    taskId: session.taskId,
    projectId: session.projectId,
  }));
  const folded = foldStats({
    serverSessions,
    pending: input.pending,
    handedOff: input.handedOff,
    streakDatesBeforeRange: input.snapshot.streakDatesBeforeRange,
    serverBest: input.snapshot.bestStreak,
    today,
    timeZone,
  });
  const day = folded.byDay.get(today);
  return {
    status: "ready",
    offline: input.offline,
    pro: input.snapshot.pro,
    timeZone,
    today,
    from: input.snapshot.from,
    to: input.snapshot.to,
    todayFocusSec: day?.focusSec ?? 0,
    todaySessions: day?.sessions ?? 0,
    currentStreak: folded.currentStreak,
    bestStreak: folded.bestStreak,
    byDay: folded.byDay,
    sessions: folded.sessions,
  };
}
