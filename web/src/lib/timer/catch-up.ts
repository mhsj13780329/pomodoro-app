// Guest catch-up: the tab was asleep, so replay the schedule up to `now`.
// Pure and arithmetic. A week asleep with 1-second phases must not cost one loop turn per phase.
import {
  advancePhase,
  durationSec,
  finishedFocus,
  type FocusSessionDraft,
  type Phase,
  type PhaseSettings,
  type TransitionTimer,
} from "./transitions";

export type CatchUpResult = {
  /** The timer as if the page had stayed open. Unchanged (same object) when nothing ended. */
  timer: TransitionTimer;
  /** Every focus that finished between the old state and `now`, oldest first, at most `maxSessions` (the newest kept). */
  sessions: FocusSessionDraft[];
  /** True when at least one phase ended. */
  ended: boolean;
};

/** Whole milliseconds. The schedule is computed in ms so pauses stay exact. */
function ms(sec: number): number {
  return Math.round(sec * 1000);
}

function autoStarts(settings: PhaseSettings, phase: Phase): boolean {
  if (phase === "focus") return settings.autoStartFocus;
  if (phase === "shortBreak") return settings.autoStartShortBreak;
  return settings.autoStartLongBreak;
}

function phaseEndAt(timer: TransitionTimer): number {
  if (timer.startedAt == null) return Number.POSITIVE_INFINITY;
  return timer.startedAt + ms(timer.pausedTotalSec) + ms(timer.plannedSec);
}

/** `count` finished focuses; the i-th started at `startOf(i)` and ran `lenMs`. Never expanded until the end. */
type Run = { count: number; startOf: (i: number) => number; lenMs: number; durationSec: number };

function singleRun(draft: FocusSessionDraft): Run {
  return {
    count: 1,
    startOf: () => draft.startedAt,
    lenMs: draft.endedAt - draft.startedAt,
    durationSec: draft.durationSec,
  };
}

/** Build only the newest `max` sessions, oldest first. Cost is O(max), whatever the sleep length. */
function buildSessions(
  runs: Run[],
  max: number,
  taskId: string | null,
  newId: () => string,
): FocusSessionDraft[] {
  if (!(max > 0)) return [];
  let total = 0;
  for (const run of runs) total += run.count;
  let skip = Math.max(0, total - Math.floor(max));
  const out: FocusSessionDraft[] = [];
  for (const run of runs) {
    if (skip >= run.count) {
      skip -= run.count;
      continue;
    }
    for (let i = skip; i < run.count; i += 1) {
      const startedAt = run.startOf(i);
      out.push({
        id: newId(),
        phase: "focus",
        startedAt,
        endedAt: startedAt + run.lenMs,
        durationSec: run.durationSec,
        completed: true,
        taskId,
      });
    }
    skip = 0;
  }
  return out;
}

type Landing = { timer: TransitionTimer; runs: Run[] };

function waitAt(base: TransitionTimer, settings: PhaseSettings, phase: Phase, count: number): TransitionTimer {
  return {
    ...base,
    phase,
    status: "idle",
    startedAt: null,
    plannedSec: durationSec(settings, phase),
    pausedAt: null,
    pausedTotalSec: 0,
    cycleIndex: count,
  };
}

function beginAt(
  base: TransitionTimer,
  settings: PhaseSettings,
  phase: Phase,
  count: number,
  startedAt: number,
): TransitionTimer {
  return {
    ...base,
    phase,
    status: "running",
    startedAt,
    plannedSec: durationSec(settings, phase),
    pausedAt: null,
    pausedTotalSec: 0,
    cycleIndex: count,
  };
}

/**
 * All three auto-starts are on, so focus -> short ... -> long repeats forever.
 * Lay the cycle on a timeline whose origin makes `next` start at `endAt`, then one modulo
 * finds the phase running at `now` and a division counts the focuses that ended on the way.
 */
function openCycle(
  base: TransitionTimer,
  settings: PhaseSettings,
  next: { phase: Phase; cycleIndex: number },
  endAt: number,
  now: number,
): Landing {
  const n = settings.longBreakEvery;
  const focus = ms(settings.focusSec);
  const rest = ms(settings.shortBreakSec);
  const long = ms(settings.longBreakSec);
  const pair = focus + rest;
  const cycle = n * focus + Math.max(0, n - 1) * rest + long;

  let offset: number;
  if (next.phase === "focus") offset = Math.min(next.cycleIndex, Math.max(0, n - 1)) * pair;
  else if (next.phase === "longBreak") offset = (n - 1) * pair + focus;
  else {
    const done = Math.min(Math.max(next.cycleIndex, 1), Math.max(1, n - 1));
    offset = (done - 1) * pair + focus;
  }
  const origin = endAt - offset;

  // Focuses whose end is at or before `elapsed` on this timeline.
  const endedBy = (elapsed: number): number => {
    const cycles = Math.floor(elapsed / cycle);
    const t = elapsed - cycles * cycle;
    const inside = t < focus ? 0 : Math.min(n, Math.floor((t - focus) / pair) + 1);
    return cycles * n + inside;
  };
  const first = endedBy(endAt - origin);
  const last = endedBy(Math.max(0, now - origin));

  // Where `now` falls inside the cycle.
  const elapsed = Math.max(0, now - origin);
  let t = elapsed % cycle;
  let spot: { phase: Phase; count: number; offsetMs: number } = { phase: "focus", count: 0, offsetMs: 0 };
  for (let c = 0; c < n; c += 1) {
    if (t < focus) {
      spot = { phase: "focus", count: c, offsetMs: t };
      break;
    }
    t -= focus;
    const isLast = c === n - 1;
    const len = isLast ? long : rest;
    if (t < len) {
      spot = { phase: isLast ? "longBreak" : "shortBreak", count: c + 1, offsetMs: t };
      break;
    }
    t -= len;
  }

  const runs: Run[] =
    last > first
      ? [
          {
            count: last - first,
            startOf: (i) => {
              const j = first + i;
              return origin + Math.floor(j / n) * cycle + (j % n) * pair;
            },
            lenMs: focus,
            durationSec: Math.round(settings.focusSec),
          },
        ]
      : [];
  return { timer: beginAt(base, settings, spot.phase, spot.count, now - spot.offsetMs), runs };
}

/**
 * Focus and short break keep auto-starting, the long break does not. Jump across that
 * run in one step, then leave the long break waiting at its full length.
 */
function runBeforeLongBreak(
  base: TransitionTimer,
  settings: PhaseSettings,
  next: { phase: Phase; cycleIndex: number },
  nextStart: number,
  now: number,
): Landing {
  const n = settings.longBreakEvery;
  const focus = ms(settings.focusSec);
  const rest = ms(settings.shortBreakSec);
  if (focus <= 0 || rest <= 0) {
    return { timer: waitAt(base, settings, next.phase, next.cycleIndex), runs: [] };
  }

  const startCount = next.cycleIndex;
  let runStart = nextStart;
  if (next.phase === "shortBreak") {
    if (now < nextStart + rest) {
      return { timer: beginAt(base, settings, "shortBreak", startCount, nextStart), runs: [] };
    }
    runStart = nextStart + rest;
  }
  if (startCount >= n) return { timer: waitAt(base, settings, "longBreak", n), runs: [] };

  const focusesLeft = n - startCount;
  const shortsLeft = focusesLeft - 1;
  const pair = focus + rest;
  const longStart = runStart + focusesLeft * focus + shortsLeft * rest;
  const durationSecRounded = Math.round(settings.focusSec);
  const runOf = (count: number): Run[] =>
    count > 0
      ? [{ count, startOf: (i) => runStart + i * pair, lenMs: focus, durationSec: durationSecRounded }]
      : [];

  if (now >= longStart) {
    return { timer: waitAt(base, settings, "longBreak", n), runs: runOf(focusesLeft) };
  }
  const into = now - runStart;
  const pairSpan = shortsLeft * pair;
  if (shortsLeft > 0 && into < pairSpan) {
    const pairIndex = Math.floor(into / pair);
    const within = into - pairIndex * pair;
    const count = startCount + pairIndex;
    if (within < focus) {
      return { timer: beginAt(base, settings, "focus", count, now - within), runs: runOf(pairIndex) };
    }
    return {
      timer: beginAt(base, settings, "shortBreak", count + 1, now - (within - focus)),
      runs: runOf(pairIndex + 1),
    };
  }
  return {
    timer: beginAt(base, settings, "focus", n - 1, now - (into - pairSpan)),
    runs: runOf(shortsLeft),
  };
}

/**
 * Guests only. Signed-in devices send one `complete` instead (PLAN.md §5.6).
 * If the running phase already ended at `now`, finish it and keep going as if the page had
 * stayed open. Each next phase starts when the previous one ended, not when the tab wakes,
 * and only if its auto-start is on. Calling again with the same `now` does nothing.
 * `newId` makes each finished focus's id. runId, version and taskId are carried through unchanged.
 */
export function catchUp(
  timer: TransitionTimer,
  settings: PhaseSettings,
  now: number,
  newId: () => string,
  maxSessions = 200,
): CatchUpResult {
  const unchanged: CatchUpResult = { timer, sessions: [], ended: false };
  if (timer.status !== "running" || timer.startedAt == null) return unchanged;
  if (!(timer.plannedSec > 0) || !(settings.longBreakEvery >= 1)) return unchanged;
  if (now < phaseEndAt(timer)) return unchanged;

  const runs: Run[] = [];
  const finish = (landing: Landing): CatchUpResult => ({
    timer: landing.timer,
    sessions: buildSessions([...runs, ...landing.runs], maxSessions, timer.taskId, newId),
    ended: true,
  });

  const open = settings.autoStartFocus && settings.autoStartShortBreak && settings.autoStartLongBreak;
  const jumpsToLong =
    settings.autoStartFocus && settings.autoStartShortBreak && !settings.autoStartLongBreak;
  const positive =
    settings.focusSec > 0 && settings.shortBreakSec > 0 && settings.longBreakSec > 0;

  let current = timer;
  // Blocks within a few steps unless a jump applies; the cap is only a backstop.
  for (let step = 0; step < 1000; step += 1) {
    const endAt = phaseEndAt(current);
    if (now < endAt) return finish({ timer: current, runs: [] });

    const done = finishedFocus(current);
    if (done) runs.push(singleRun(done));

    const next = advancePhase(current.phase, current.cycleIndex, settings.longBreakEvery);
    if (!autoStarts(settings, next.phase) || !(durationSec(settings, next.phase) > 0)) {
      return finish({ timer: waitAt(current, settings, next.phase, next.cycleIndex), runs: [] });
    }
    if (open && positive) return finish(openCycle(current, settings, next, endAt, now));
    if (jumpsToLong && next.phase !== "longBreak") {
      return finish(runBeforeLongBreak(current, settings, next, endAt, now));
    }
    current = beginAt(current, settings, next.phase, next.cycleIndex, endAt);
  }
  return finish({ timer: current, runs: [] });
}
