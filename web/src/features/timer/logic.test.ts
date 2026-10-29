import { describe, expect, it } from "vitest";
import {
  catchUp,
  defaultTimer,
  displaySeconds,
  pause,
  remainingMs,
  reset,
  resume,
  selectPhase,
  setLongBreakEvery,
  setPhaseSeconds,
  skip,
  start,
  type TimerCore,
} from "./logic";

function at(partial: Partial<TimerCore>): TimerCore {
  return { ...defaultTimer, ...partial };
}

const MIN = 60 * 1000;

describe("remaining time", () => {
  it("shows the full duration while idle", () => {
    expect(remainingMs(defaultTimer, 50_000)).toBe(25 * MIN);
    expect(displaySeconds(defaultTimer, 50_000)).toBe(25 * 60);
  });

  it("counts down from the start timestamp", () => {
    const running = start(defaultTimer, 1_000);
    expect(remainingMs(running, 1_000)).toBe(25 * MIN);
    expect(remainingMs(running, 11_000)).toBe(25 * MIN - 10_000);
  });

  it("freezes while paused and keeps the pause length exact", () => {
    let timer = start(defaultTimer, 1_000);
    timer = pause(timer, 11_000);
    const frozen = remainingMs(timer, 11_000);
    expect(remainingMs(timer, 50_000)).toBe(frozen);

    timer = resume(timer, 21_000);
    expect(timer.pausedTotalSec).toBe(10);
    expect(timer.startedAt).toBe(1_000);
    // 10s ran, then 10s paused, then 5s ran. 15s of the phase are gone.
    expect(remainingMs(timer, 26_000)).toBe(25 * MIN - 15_000);
  });
});

describe("phase advance", () => {
  it("starts the short break when the focus ended, not when we look", () => {
    const running = at({
      status: "running",
      startedAt: 0,
      plannedSec: 25 * 60,
      autoStartShortBreak: true,
      autoStartFocus: false,
    });
    const now = 26 * MIN;
    const next = catchUp(running, now).state;
    expect(next.phase).toBe("shortBreak");
    expect(next.status).toBe("running");
    expect(next.startedAt).toBe(25 * MIN);
    expect(next.completedFocusInCycle).toBe(1);
    expect(remainingMs(next, now)).toBe(4 * MIN);
  });

  it("leaves the next phase idle when its auto-start is off", () => {
    const running = at({
      status: "running",
      startedAt: 0,
      plannedSec: 25 * 60,
      autoStartShortBreak: false,
    });
    const next = catchUp(running, 10 * 60 * MIN).state;
    expect(next.phase).toBe("shortBreak");
    expect(next.status).toBe("idle");
    expect(next.plannedSec).toBe(5 * 60);
    expect(next.completedFocusInCycle).toBe(1);
    expect(remainingMs(next, 10 * 60 * MIN)).toBe(5 * MIN);
  });

  it("opens the long break on the Nth finished focus and then a new cycle", () => {
    const running = at({
      status: "running",
      startedAt: 0,
      plannedSec: 25 * 60,
      autoStartFocus: true,
      autoStartShortBreak: true,
      autoStartLongBreak: true,
    });
    const fourthEnds = (4 * 25 + 3 * 5) * MIN;
    const long = catchUp(running, fourthEnds);
    expect(long.ended).toBe(true);
    expect(long.state.phase).toBe("longBreak");
    expect(long.state.status).toBe("running");
    expect(long.state.completedFocusInCycle).toBe(4);
    expect(long.state.startedAt).toBe(fourthEnds);

    const cycleEnds = fourthEnds + 15 * MIN;
    const again = catchUp(running, cycleEnds).state;
    expect(again.phase).toBe("focus");
    expect(again.completedFocusInCycle).toBe(0);
    expect(again.startedAt).toBe(cycleEnds);
    expect(remainingMs(again, cycleEnds)).toBe(25 * MIN);
  });

  it("stops at a long break whose auto-start is off, even after a long gap", () => {
    const running = at({
      status: "running",
      startedAt: 0,
      plannedSec: 25 * 60,
      autoStartFocus: true,
      autoStartShortBreak: true,
      autoStartLongBreak: false,
    });
    const after = (4 * 25 + 3 * 5) * MIN + 10 * MIN;
    const next = catchUp(running, after).state;
    expect(next.phase).toBe("longBreak");
    expect(next.status).toBe("idle");
    expect(next.completedFocusInCycle).toBe(4);
    expect(remainingMs(next, after)).toBe(15 * MIN);
  });

  it("does not move a paused timer", () => {
    const paused = pause(start(defaultTimer, 0), 5_000);
    const later = catchUp(paused, 5 * 60 * MIN);
    expect(later.ended).toBe(false);
    expect(later.state).toBe(paused);
  });

  it("is stable when applied twice at the same instant", () => {
    const running = start(defaultTimer, 0);
    const now = 30 * MIN;
    const once = catchUp(running, now);
    const twice = catchUp(once.state, now);
    expect(once.ended).toBe(true);
    expect(twice.ended).toBe(false);
    expect(twice.state).toBe(once.state);
  });

  it("lands inside a long focus/short run without walking every phase", () => {
    const running = at({
      status: "running",
      startedAt: 0,
      plannedSec: 1,
      focusSec: 1,
      shortBreakSec: 1,
      longBreakSec: 1,
      longBreakEvery: 2_000_000,
      autoStartFocus: true,
      autoStartShortBreak: true,
      autoStartLongBreak: false,
      completedFocusInCycle: 0,
    });
    const next = catchUp(running, 5_000).state;
    expect(next.phase).toBe("shortBreak");
    expect(next.completedFocusInCycle).toBe(3);
    expect(next.status).toBe("running");
    expect(remainingMs(next, 5_000)).toBe(1_000);
  }, 1_000);

  it("projects a long open cycle in one step", () => {
    const running = at({
      status: "running",
      startedAt: 0,
      plannedSec: 0.001,
      focusSec: 0.001,
      shortBreakSec: 0.001,
      longBreakSec: 0.001,
      autoStartFocus: true,
      autoStartShortBreak: true,
      autoStartLongBreak: true,
    });
    const next = catchUp(running, 10_000_000);
    expect(next.ended).toBe(true);
    expect(next.state.status).toBe("running");
    expect(remainingMs(next.state, 10_000_000)).toBeGreaterThanOrEqual(0);
  }, 1_000);
});

describe("controls", () => {
  it("resets the current phase and leaves the cycle count", () => {
    const running = at({
      status: "running",
      startedAt: 0,
      completedFocusInCycle: 2,
    });
    const next = reset(running);
    expect(next.status).toBe("idle");
    expect(next.phase).toBe("focus");
    expect(next.completedFocusInCycle).toBe(2);
    expect(next.plannedSec).toBe(25 * 60);
  });

  it("skips a focus without counting it", () => {
    const running = at({
      status: "running",
      startedAt: 0,
      completedFocusInCycle: 3,
    });
    const next = skip(running);
    expect(next.phase).toBe("shortBreak");
    expect(next.status).toBe("idle");
    expect(next.completedFocusInCycle).toBe(3);
  });

  it("switches tabs onto a fresh idle phase", () => {
    const running = start(defaultTimer, 0);
    const next = selectPhase(running, "longBreak");
    expect(next.phase).toBe("longBreak");
    expect(next.status).toBe("idle");
    expect(next.plannedSec).toBe(15 * 60);
    expect(next.completedFocusInCycle).toBe(0);
    expect(selectPhase(next, "longBreak")).toBe(next);
  });

  it("rejects a non-positive duration and applies a valid one to an idle phase", () => {
    expect(setPhaseSeconds(defaultTimer, "focus", 0)).toBe(defaultTimer);
    expect(setPhaseSeconds(defaultTimer, "focus", -5)).toBe(defaultTimer);
    const next = setPhaseSeconds(defaultTimer, "focus", 90);
    expect(next.focusSec).toBe(90);
    expect(next.plannedSec).toBe(90);

    const running = start(defaultTimer, 0);
    const edited = setPhaseSeconds(running, "focus", 90);
    expect(edited.focusSec).toBe(90);
    expect(edited.plannedSec).toBe(25 * 60);
  });

  it("keeps the long-break interval an integer of at least 1", () => {
    expect(setLongBreakEvery(defaultTimer, 0)).toBe(defaultTimer);
    expect(setLongBreakEvery(defaultTimer, 2.5)).toBe(defaultTimer);
    const timer = at({ completedFocusInCycle: 3 });
    expect(setLongBreakEvery(timer, 2).completedFocusInCycle).toBe(2);
    expect(setLongBreakEvery(timer, 1).longBreakEvery).toBe(1);
  });
});
