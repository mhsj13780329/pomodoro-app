// Pure timer math. No React. The screen asks "what time is it?" and this file answers
// from timestamps, so a locked phone or a background tab cannot drift the countdown.

export type Phase = "focus" | "shortBreak" | "longBreak";

export type RunStatus = "idle" | "running" | "paused";

export type TimerCore = {
  phase: Phase;
  status: RunStatus;
  /** Epoch ms when the current run started. Null while idle. */
  startedAt: number | null;
  /** Length of this run, snapped when the phase started. Later setting edits do not shrink it. */
  plannedSec: number;
  /** Epoch ms when the user paused. Null unless status is "paused". */
  pausedAt: number | null;
  /** Seconds already spent paused during this run. */
  pausedTotalSec: number;
  /**
   * Focuses finished in the current cycle.
   * During a long break this equals longBreakEvery, so every dot can show as done.
   */
  completedFocusInCycle: number;
  focusSec: number;
  shortBreakSec: number;
  longBreakSec: number;
  /** Completed focuses before a long break. Integer ≥ 1. */
  longBreakEvery: number;
  autoStartFocus: boolean;
  autoStartShortBreak: boolean;
  autoStartLongBreak: boolean;
};

export const PHASES: readonly Phase[] = ["focus", "shortBreak", "longBreak"];

export const defaultTimer: TimerCore = {
  phase: "focus",
  status: "idle",
  startedAt: null,
  plannedSec: 25 * 60,
  pausedAt: null,
  pausedTotalSec: 0,
  completedFocusInCycle: 0,
  focusSec: 25 * 60,
  shortBreakSec: 5 * 60,
  longBreakSec: 15 * 60,
  longBreakEvery: 4,
  autoStartFocus: false,
  autoStartShortBreak: true,
  autoStartLongBreak: true,
};

export function durationOf(state: TimerCore, phase: Phase): number {
  if (phase === "focus") return state.focusSec;
  if (phase === "shortBreak") return state.shortBreakSec;
  return state.longBreakSec;
}

function autoOf(state: TimerCore, phase: Phase): boolean {
  if (phase === "focus") return state.autoStartFocus;
  if (phase === "shortBreak") return state.autoStartShortBreak;
  return state.autoStartLongBreak;
}

/** Whole milliseconds. The schedule is computed in ms so pauses stay exact. */
function ms(sec: number): number {
  return Math.round(sec * 1000);
}

function durationMs(state: TimerCore, phase: Phase): number {
  return ms(durationOf(state, phase));
}

/**
 * Time left in this phase.
 * While paused, the clock is frozen at pausedAt. Otherwise it is `now`.
 * Remaining is never stored: it is always planned minus the time actually spent running.
 */
export function remainingMs(state: TimerCore, now: number): number {
  if (state.status === "idle" || state.startedAt == null) {
    return ms(state.plannedSec);
  }
  const effectiveNow =
    state.status === "paused" && state.pausedAt != null ? state.pausedAt : now;
  const elapsed = effectiveNow - state.startedAt - ms(state.pausedTotalSec);
  return Math.max(0, ms(state.plannedSec) - elapsed);
}

/** Seconds to show on the ring. Rounded up so the first instant still shows the full duration. */
export function displaySeconds(state: TimerCore, now: number): number {
  return Math.ceil(remainingMs(state, now) / 1000 - 1e-6);
}

function phaseEndAt(state: TimerCore): number {
  if (state.startedAt == null) return Number.POSITIVE_INFINITY;
  return state.startedAt + ms(state.pausedTotalSec) + ms(state.plannedSec);
}

function waitPhase(base: TimerCore, phase: Phase, count: number): TimerCore {
  return {
    ...base,
    phase,
    status: "idle",
    startedAt: null,
    plannedSec: durationOf(base, phase),
    pausedAt: null,
    pausedTotalSec: 0,
    completedFocusInCycle: count,
  };
}

function beginPhase(
  base: TimerCore,
  phase: Phase,
  count: number,
  startedAt: number,
): TimerCore {
  return {
    ...base,
    phase,
    status: "running",
    startedAt,
    plannedSec: durationOf(base, phase),
    pausedAt: null,
    pausedTotalSec: 0,
    completedFocusInCycle: count,
  };
}

/** Where a phase goes when it actually runs out. A finished focus counts toward the long break. */
function advance(state: TimerCore): { phase: Phase; completedFocusInCycle: number } {
  if (state.phase === "focus") {
    const completed = state.completedFocusInCycle + 1;
    if (completed >= state.longBreakEvery) {
      return { phase: "longBreak", completedFocusInCycle: completed };
    }
    return { phase: "shortBreak", completedFocusInCycle: completed };
  }
  if (state.phase === "longBreak") {
    return { phase: "focus", completedFocusInCycle: 0 };
  }
  return { phase: "focus", completedFocusInCycle: state.completedFocusInCycle };
}

/**
 * Skip does not count as a finished focus, so mashing skip cannot earn a long break.
 * A skipped long break still opens a fresh cycle.
 */
function skipTarget(state: TimerCore): { phase: Phase; completedFocusInCycle: number } {
  if (state.phase === "focus") {
    return { phase: "shortBreak", completedFocusInCycle: state.completedFocusInCycle };
  }
  if (state.phase === "longBreak") {
    return { phase: "focus", completedFocusInCycle: 0 };
  }
  return { phase: "focus", completedFocusInCycle: state.completedFocusInCycle };
}

export function start(state: TimerCore, now: number): TimerCore {
  if (state.status !== "idle") return state;
  return {
    ...state,
    status: "running",
    startedAt: now,
    pausedAt: null,
    pausedTotalSec: 0,
    plannedSec: durationOf(state, state.phase),
  };
}

export function pause(state: TimerCore, now: number): TimerCore {
  if (state.status !== "running" || state.startedAt == null) return state;
  return { ...state, status: "paused", pausedAt: now };
}

export function resume(state: TimerCore, now: number): TimerCore {
  if (state.status !== "paused" || state.pausedAt == null) return state;
  // Add the real gap. The start timestamp stays put, so the pause cannot drift.
  const pausedSec = (now - state.pausedAt) / 1000;
  return {
    ...state,
    status: "running",
    pausedAt: null,
    pausedTotalSec: state.pausedTotalSec + pausedSec,
  };
}

export function reset(state: TimerCore): TimerCore {
  return waitPhase(state, state.phase, state.completedFocusInCycle);
}

export function skip(state: TimerCore): TimerCore {
  const next = skipTarget(state);
  return waitPhase(state, next.phase, next.completedFocusInCycle);
}

export function selectPhase(state: TimerCore, phase: Phase): TimerCore {
  if (phase === state.phase) return state;
  return waitPhase(state, phase, state.completedFocusInCycle);
}

export function setPhaseSeconds(state: TimerCore, phase: Phase, sec: number): TimerCore {
  if (!Number.isFinite(sec) || sec <= 0) return state;
  const next = { ...state };
  if (phase === "focus") next.focusSec = sec;
  else if (phase === "shortBreak") next.shortBreakSec = sec;
  else next.longBreakSec = sec;
  // An idle phase has not started, so it picks up the new length immediately.
  if (next.status === "idle" && next.phase === phase) next.plannedSec = sec;
  return next;
}

export function setLongBreakEvery(state: TimerCore, n: number): TimerCore {
  if (!Number.isInteger(n) || n < 1) return state;
  return {
    ...state,
    longBreakEvery: n,
    completedFocusInCycle: Math.min(state.completedFocusInCycle, n),
  };
}

export function toggleAutoStart(state: TimerCore, phase: Phase): TimerCore {
  if (phase === "focus") return { ...state, autoStartFocus: !state.autoStartFocus };
  if (phase === "shortBreak") return { ...state, autoStartShortBreak: !state.autoStartShortBreak };
  return { ...state, autoStartLongBreak: !state.autoStartLongBreak };
}

function cycleMs(state: TimerCore): number {
  const n = state.longBreakEvery;
  const focus = durationMs(state, "focus");
  const short = durationMs(state, "shortBreak");
  const long = durationMs(state, "longBreak");
  return n * focus + Math.max(0, n - 1) * short + long;
}

/** Position, in ms, where this phase sits inside one full focus → short → long cycle. */
function cycleOffsetMs(phase: Phase, count: number, state: TimerCore): number {
  const focus = durationMs(state, "focus");
  const rest = durationMs(state, "shortBreak");
  const n = state.longBreakEvery;
  if (phase === "focus") return Math.min(count, Math.max(0, n - 1)) * (focus + rest);
  if (phase === "longBreak") return (n - 1) * (focus + rest) + focus;
  const done = Math.min(Math.max(count, 1), Math.max(1, n - 1));
  return (done - 1) * (focus + rest) + focus;
}

type Spot = { phase: Phase; count: number; offsetMs: number };

function locate(intoMs: number, state: TimerCore): Spot {
  const n = state.longBreakEvery;
  const focus = durationMs(state, "focus");
  const rest = durationMs(state, "shortBreak");
  const long = durationMs(state, "longBreak");
  const cycle = cycleMs(state);
  let t = cycle > 0 ? intoMs % cycle : 0;
  if (t < 0) t += cycle;

  for (let c = 0; c < n; c += 1) {
    if (t < focus || focus <= 0) {
      return { phase: "focus", count: c, offsetMs: Math.max(0, Math.min(t, focus)) };
    }
    t -= focus;
    const last = c === n - 1;
    const br = last ? long : rest;
    if (t < br || br <= 0) {
      return {
        phase: last ? "longBreak" : "shortBreak",
        count: c + 1,
        offsetMs: Math.max(0, Math.min(t, br)),
      };
    }
    t -= br;
  }
  return { phase: "focus", count: 0, offsetMs: 0 };
}

/**
 * Every auto-start is on, so the cycle repeats without a stop.
 * One modulo lands on the right phase. Walking phase by phase would freeze the tab
 * after a long sleep with very short durations.
 */
function projectOpenCycle(state: TimerCore, now: number): TimerCore {
  const endAt = phaseEndAt(state);
  const next = advance(state);
  const origin = endAt - cycleOffsetMs(next.phase, next.completedFocusInCycle, state);
  const elapsed = Math.max(0, now - origin);
  const spot = locate(elapsed, state);
  return beginPhase(state, spot.phase, spot.count, now - spot.offsetMs);
}

/**
 * Focus and short break keep auto-starting, and the long break does not.
 * Jump across that run in one step, then leave the long break waiting.
 */
function landBeforeLongBreak(
  base: TimerCore,
  next: { phase: Phase; completedFocusInCycle: number },
  nextStart: number,
  now: number,
): TimerCore {
  const n = base.longBreakEvery;
  const focus = durationMs(base, "focus");
  const rest = durationMs(base, "shortBreak");
  if (focus <= 0 || rest <= 0 || n < 1) {
    return waitPhase(base, next.phase, next.completedFocusInCycle);
  }

  if (next.phase === "focus") {
    return landFocusRun(base, next.completedFocusInCycle, nextStart, now, focus, rest, n);
  }

  const count = next.completedFocusInCycle;
  const into = now - nextStart;
  if (into < rest) return beginPhase(base, "shortBreak", count, now - into);
  return landFocusRun(base, count, nextStart + rest, now, focus, rest, n);
}

function landFocusRun(
  base: TimerCore,
  startCount: number,
  runStart: number,
  now: number,
  focus: number,
  rest: number,
  n: number,
): TimerCore {
  if (startCount >= n) return waitPhase(base, "longBreak", n);
  const focusesLeft = n - startCount;
  const shortsLeft = focusesLeft - 1;
  const longStart = runStart + focusesLeft * focus + shortsLeft * rest;
  if (now >= longStart) return waitPhase(base, "longBreak", n);

  const into = now - runStart;
  const pair = focus + rest;
  const pairSpan = shortsLeft * pair;
  if (shortsLeft > 0 && into < pairSpan) {
    const pairIndex = Math.floor(into / pair);
    const within = into % pair;
    const count = startCount + pairIndex;
    if (within < focus) return beginPhase(base, "focus", count, now - within);
    return beginPhase(base, "shortBreak", count + 1, now - (within - focus));
  }
  return beginPhase(base, "focus", n - 1, now - (into - pairSpan));
}

/** Step forward only until a phase refuses to auto-start. That phase waits at its full length. */
function projectUntilBlocked(state: TimerCore, now: number): TimerCore {
  let current = state;
  for (let step = 0; step < 8; step += 1) {
    const endAt = phaseEndAt(current);
    if (now < endAt) return current;

    const next = advance(current);
    const dur = durationOf(current, next.phase);
    if (!autoOf(current, next.phase) || !(dur > 0)) {
      return waitPhase(current, next.phase, next.completedFocusInCycle);
    }

    if (
      current.autoStartFocus &&
      current.autoStartShortBreak &&
      !current.autoStartLongBreak &&
      next.phase !== "longBreak"
    ) {
      return landBeforeLongBreak(current, next, endAt, now);
    }

    current = beginPhase(current, next.phase, next.completedFocusInCycle, endAt);
  }
  return current;
}

/**
 * If this running phase already ended at `now`, finish it and keep going as if the page
 * had stayed open. The next phase starts when the previous one ended — not when the
 * tab wakes up — but only if that next phase's auto-start is on.
 * Calling this again with the same `now` does nothing, so a tick cannot loop.
 */
export function catchUp(state: TimerCore, now: number): { state: TimerCore; ended: boolean } {
  if (state.status !== "running" || state.startedAt == null) {
    return { state, ended: false };
  }
  if (!(state.plannedSec > 0) || !(state.longBreakEvery >= 1)) {
    return { state, ended: false };
  }
  if (now < phaseEndAt(state)) return { state, ended: false };

  const open =
    state.autoStartFocus && state.autoStartShortBreak && state.autoStartLongBreak;
  const next = open ? projectOpenCycle(state, now) : projectUntilBlocked(state, now);
  return { state: next, ended: true };
}
