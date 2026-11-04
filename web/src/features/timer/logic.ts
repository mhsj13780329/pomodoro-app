// Client timer shape and the settings edits. No React. Phase changes (start, pause,
// complete, skip...) live in lib/timer/transitions; guest catch-up in lib/timer/catch-up.

import type { Phase } from "@/lib/timer/transitions";

export { displaySeconds, remainingMs } from "@/lib/timer/remaining";
export type { Phase };

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
  cycleIndex: number;
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
  cycleIndex: 0,
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
    cycleIndex: Math.min(state.cycleIndex, n),
  };
}

export function toggleAutoStart(state: TimerCore, phase: Phase): TimerCore {
  if (phase === "focus") return { ...state, autoStartFocus: !state.autoStartFocus };
  if (phase === "shortBreak") return { ...state, autoStartShortBreak: !state.autoStartShortBreak };
  return { ...state, autoStartLongBreak: !state.autoStartLongBreak };
}
