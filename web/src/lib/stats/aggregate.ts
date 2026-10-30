// Stats are derived. These functions turn completed focus sessions into days,
// streaks and heatmap levels. The server and the browser both call them, so a
// pending offline session is counted the same way as a row that has already synced.

import { addCivilDays, civilDate, civilKey, compareCivil, eachDay, parseCivil } from "./calendar";

export type StatSession = {
  id: string;
  /** UTC milliseconds. The local day is the day of this instant, not startedAt. */
  endedAt: number;
  startedAt: number;
  durationSec: number;
  /** Wire value (`focus`) or the database enum (`FOCUS`). */
  phase?: string;
  completed?: boolean;
  taskId?: string | null;
  projectId?: string | null;
};

export type DayTotal = {
  key: string;
  focusSec: number;
  sessions: number;
};

export function isCountedFocus(session: { phase?: string; completed?: boolean }): boolean {
  const phase = (session.phase ?? "").toLowerCase();
  if (phase !== "focus") return false;
  if (session.completed === false) return false;
  return session.completed === true || session.completed === undefined;
}

/** The whole session lands on the local date of endedAt, even if it started yesterday. */
export function sessionLocalKey(session: Pick<StatSession, "endedAt">, timeZone: string): string {
  return civilKey(civilDate(new Date(session.endedAt), timeZone));
}

/**
 * One row per local day. A repeated id counts once (the server row and the
 * queue can both still hold it for a moment after upload).
 */
export function groupByLocalDate(sessions: readonly StatSession[], timeZone: string): Map<string, DayTotal> {
  const map = new Map<string, DayTotal>();
  const seen = new Set<string>();
  for (const session of sessions) {
    if (!isCountedFocus(session) || seen.has(session.id)) continue;
    seen.add(session.id);
    const key = sessionLocalKey(session, timeZone);
    const row = map.get(key) ?? { key, focusSec: 0, sessions: 0 };
    row.focusSec += session.durationSec;
    row.sessions += 1;
    map.set(key, row);
  }
  return map;
}

export function totalsInRange(byDay: ReadonlyMap<string, DayTotal>, from: string, to: string): DayTotal {
  let focusSec = 0;
  let sessions = 0;
  for (const key of eachDay(from, to)) {
    const row = byDay.get(key);
    if (!row) continue;
    focusSec += row.focusSec;
    sessions += row.sessions;
  }
  return { key: from, focusSec, sessions };
}

/**
 * Minutes per elapsed local day. Days after `today` are not in the divisor:
 * a month that is only half over is not averaged across its future days.
 */
export function dailyAverageSec(focusSec: number, from: string, to: string, today: string): number {
  const endDate = parseCivil(to);
  const todayDate = parseCivil(today);
  const start = parseCivil(from);
  if (!endDate || !todayDate || !start) return 0;
  const end = compareCivil(endDate, todayDate) < 0 ? to : today;
  if (compareCivil(start, parseCivil(end)!) > 0) return 0;
  const days = eachDay(from, end).length;
  if (days === 0) return 0;
  return focusSec / days;
}

/**
 * Fixed minutes, so a color means the same amount of focus in every month.
 * 1 is under one 25-minute pomodoro, 2 is about one, 3 is two or three, 4 is four or more.
 */
export function heatLevel(focusSec: number): 0 | 1 | 2 | 3 | 4 {
  const minutes = focusSec / 60;
  if (!(minutes > 0)) return 0;
  if (minutes < 25) return 1;
  if (minutes < 50) return 2;
  if (minutes < 100) return 3;
  return 4;
}

/** First list wins when an id is repeated. Pass the server rows first. */
export function mergeById<T extends { id: string }>(...lists: readonly (readonly T[])[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

export type StreakResult = {
  current: number;
  best: number;
  /** Oldest first. The run that `current` is counting, ending today or yesterday. */
  currentDates: string[];
};

/**
 * A day counts when its key is in `dates`. Today can be empty: the run that
 * ended yesterday is still the current streak. It breaks only after a whole
 * local day with no session (yesterday empty, and today empty too).
 */
export function streaks(dates: readonly string[], today: string): StreakResult {
  const unique = [...new Set(dates)].filter((key) => parseCivil(key) != null).sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const key of unique) {
    const prevDate = previous ? parseCivil(previous) : null;
    if (prevDate && civilKey(addCivilDays(prevDate, 1)) === key) run += 1;
    else run = 1;
    if (run > best) best = run;
    previous = key;
  }

  const counted = new Set(unique);
  const todayDate = parseCivil(today);
  if (!todayDate) return { current: 0, best, currentDates: [] };

  let cursor = todayDate;
  if (!counted.has(today)) {
    const yesterday = addCivilDays(todayDate, -1);
    if (!counted.has(civilKey(yesterday))) return { current: 0, best, currentDates: [] };
    cursor = yesterday;
  }

  const currentDates: string[] = [];
  while (counted.has(civilKey(cursor))) {
    currentDates.push(civilKey(cursor));
    cursor = addCivilDays(cursor, -1);
  }
  currentDates.reverse();
  return { current: currentDates.length, best: Math.max(best, currentDates.length), currentDates };
}

export type FoldedStats = {
  sessions: StatSession[];
  byDay: Map<string, DayTotal>;
  currentStreak: number;
  bestStreak: number;
  currentDates: string[];
};

/**
 * Server days plus sessions this device has not uploaded yet.
 * `streakDatesBeforeRange` is only the current run that starts before the
 * window, so a long streak still adds up without sending the whole history.
 * Best stays the server's number unless the new run is longer.
 */
export function foldStats(input: {
  serverSessions: readonly StatSession[];
  pending: readonly StatSession[];
  handedOff?: readonly StatSession[];
  streakDatesBeforeRange: readonly string[];
  serverBest: number;
  today: string;
  timeZone: string;
}): FoldedStats {
  const sessions = mergeById(input.serverSessions, input.pending, input.handedOff ?? []).filter(isCountedFocus);
  const byDay = groupByLocalDate(sessions, input.timeZone);
  const streak = streaks([...input.streakDatesBeforeRange, ...byDay.keys()], input.today);
  return {
    sessions,
    byDay,
    currentStreak: streak.current,
    bestStreak: Math.max(input.serverBest, streak.best),
    currentDates: streak.currentDates,
  };
}

export type Bucket = { id: string | null; focusSec: number; sessions: number };

/** Group counted sessions. `null` is the "no task" / "no project" bucket. */
export function groupByBucket(
  sessions: readonly StatSession[],
  keyOf: (session: StatSession) => string | null,
): Bucket[] {
  const map = new Map<string | null, Bucket>();
  const seen = new Set<string>();
  for (const session of sessions) {
    if (!isCountedFocus(session) || seen.has(session.id)) continue;
    seen.add(session.id);
    const id = keyOf(session);
    const row = map.get(id) ?? { id, focusSec: 0, sessions: 0 };
    row.focusSec += session.durationSec;
    row.sessions += 1;
    map.set(id, row);
  }
  return [...map.values()].sort((a, b) => b.focusSec - a.focusSec || (a.id ?? "").localeCompare(b.id ?? ""));
}
