// One phase change. The server applies this as the authority. The client applies
// the same function for an optimistic update. Guest catch-up (several phases
// while the tab was asleep) stays in the timer feature and is not this file.

import type { RemainingStatus } from "./remaining";

export type Phase = "focus" | "shortBreak" | "longBreak";

export type PhaseSettings = {
  focusSec: number;
  shortBreakSec: number;
  longBreakSec: number;
  longBreakEvery: number;
  autoStartFocus: boolean;
  autoStartShortBreak: boolean;
  autoStartLongBreak: boolean;
};

export type TransitionTimer = {
  phase: Phase;
  status: RemainingStatus;
  startedAt: number | null;
  plannedSec: number;
  pausedAt: number | null;
  pausedTotalSec: number;
  /** Focuses finished in the current cycle. Same meaning as the client store. */
  cycleIndex: number;
  runId: string;
  version: number;
  taskId: string | null;
};

export type FocusSessionDraft = {
  id: string;
  phase: "focus";
  startedAt: number;
  endedAt: number;
  durationSec: number;
  completed: true;
  taskId: string | null;
};

export type TimerStep = {
  timer: TransitionTimer;
  session: FocusSessionDraft | null;
  changed: boolean;
};

export type TimerAction =
  | { type: "start"; runId: string }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "skip" }
  | { type: "reset" }
  | { type: "select"; phase: Phase }
  | { type: "complete"; nextRunId: string };

export function durationSec(settings: PhaseSettings, phase: Phase): number {
  if (phase === "focus") return settings.focusSec;
  if (phase === "shortBreak") return settings.shortBreakSec;
  return settings.longBreakSec;
}

function autoStarts(settings: PhaseSettings, phase: Phase): boolean {
  if (phase === "focus") return settings.autoStartFocus;
  if (phase === "shortBreak") return settings.autoStartShortBreak;
  return settings.autoStartLongBreak;
}

/** Where a phase goes when it actually runs out. A finished focus counts toward the long break. */
export function advancePhase(
  phase: Phase,
  cycleIndex: number,
  longBreakEvery: number,
): { phase: Phase; cycleIndex: number } {
  if (phase === "focus") {
    const completed = cycleIndex + 1;
    if (completed >= longBreakEvery) return { phase: "longBreak", cycleIndex: completed };
    return { phase: "shortBreak", cycleIndex: completed };
  }
  if (phase === "longBreak") return { phase: "focus", cycleIndex: 0 };
  return { phase: "focus", cycleIndex };
}

/**
 * Skip does not count as a finished focus, so mashing skip cannot earn a long break.
 * A skipped long break still opens a fresh cycle.
 */
export function skipPhase(phase: Phase, cycleIndex: number): { phase: Phase; cycleIndex: number } {
  if (phase === "focus") return { phase: "shortBreak", cycleIndex };
  if (phase === "longBreak") return { phase: "focus", cycleIndex: 0 };
  return { phase: "focus", cycleIndex };
}

function still(timer: TransitionTimer): TimerStep {
  return { timer, session: null, changed: false };
}

function bump(
  timer: TransitionTimer,
  patch: Partial<TransitionTimer>,
  session: FocusSessionDraft | null = null,
): TimerStep {
  return { timer: { ...timer, ...patch, version: timer.version + 1 }, session, changed: true };
}

function wait(timer: TransitionTimer, settings: PhaseSettings, phase: Phase, cycleIndex: number): TimerStep {
  const plannedSec = durationSec(settings, phase);
  if (
    timer.status === "idle" &&
    timer.phase === phase &&
    timer.cycleIndex === cycleIndex &&
    timer.plannedSec === plannedSec &&
    timer.startedAt == null &&
    timer.pausedAt == null &&
    timer.pausedTotalSec === 0
  ) {
    return still(timer);
  }
  return bump(timer, {
    phase,
    status: "idle",
    startedAt: null,
    plannedSec,
    pausedAt: null,
    pausedTotalSec: 0,
    cycleIndex,
  });
}

function begin(
  timer: TransitionTimer,
  settings: PhaseSettings,
  phase: Phase,
  cycleIndex: number,
  startedAt: number,
  runId: string,
  session: FocusSessionDraft | null,
): TimerStep {
  return bump(
    timer,
    {
      phase,
      status: "running",
      startedAt,
      plannedSec: durationSec(settings, phase),
      pausedAt: null,
      pausedTotalSec: 0,
      cycleIndex,
      runId,
    },
    session,
  );
}

function focusSession(timer: TransitionTimer): FocusSessionDraft | null {
  if (timer.phase !== "focus" || timer.startedAt == null || !(timer.plannedSec > 0)) return null;
  const endedAt =
    timer.startedAt + Math.round(timer.pausedTotalSec * 1000) + Math.round(timer.plannedSec * 1000);
  if (!(endedAt > timer.startedAt)) return null;
  return {
    id: timer.runId,
    phase: "focus",
    startedAt: timer.startedAt,
    endedAt,
    durationSec: Math.round(timer.plannedSec),
    completed: true,
    taskId: timer.taskId,
  };
}

export function applyTimerAction(
  timer: TransitionTimer,
  settings: PhaseSettings,
  action: TimerAction,
  now: number,
): TimerStep {
  switch (action.type) {
    case "start": {
      if (timer.status !== "idle") return still(timer);
      return begin(timer, settings, timer.phase, timer.cycleIndex, now, action.runId, null);
    }
    case "pause": {
      if (timer.status !== "running" || timer.startedAt == null) return still(timer);
      return bump(timer, { status: "paused", pausedAt: now });
    }
    case "resume": {
      if (timer.status !== "paused" || timer.pausedAt == null) return still(timer);
      // Add the real gap. The start timestamp stays put, so the pause cannot drift.
      const pausedSec = (now - timer.pausedAt) / 1000;
      return bump(timer, {
        status: "running",
        pausedAt: null,
        pausedTotalSec: timer.pausedTotalSec + pausedSec,
      });
    }
    case "reset":
      return wait(timer, settings, timer.phase, timer.cycleIndex);
    case "skip": {
      const next = skipPhase(timer.phase, timer.cycleIndex);
      return wait(timer, settings, next.phase, next.cycleIndex);
    }
    case "select": {
      if (action.phase === timer.phase) return still(timer);
      return wait(timer, settings, action.phase, timer.cycleIndex);
    }
    case "complete": {
      if (timer.status !== "running" || timer.startedAt == null) return still(timer);
      const session = focusSession(timer);
      const next = advancePhase(timer.phase, timer.cycleIndex, settings.longBreakEvery);
      // Start the next phase at `now`, not at the old end. A closed app must not
      // invent every phase that would have elapsed while it was shut.
      if (autoStarts(settings, next.phase)) {
        return begin(timer, settings, next.phase, next.cycleIndex, now, action.nextRunId, session);
      }
      const idle = wait(timer, settings, next.phase, next.cycleIndex);
      return { ...idle, session };
    }
    default: {
      const _never: never = action;
      return _never;
    }
  }
}
