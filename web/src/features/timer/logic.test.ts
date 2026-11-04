import { describe, expect, it } from "vitest";
import {
  defaultTimer,
  displaySeconds,
  remainingMs,
  setLongBreakEvery,
  setPhaseSeconds,
  toggleAutoStart,
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
    const running = at({ status: "running", startedAt: 1_000 });
    expect(remainingMs(running, 1_000)).toBe(25 * MIN);
    expect(remainingMs(running, 11_000)).toBe(25 * MIN - 10_000);
  });

  it("freezes while paused and keeps the pause length exact", () => {
    const paused = at({ status: "paused", startedAt: 1_000, pausedAt: 11_000 });
    const frozen = remainingMs(paused, 11_000);
    expect(remainingMs(paused, 50_000)).toBe(frozen);

    // 10s ran, then 10s paused, then 5s ran. 15s of the phase are gone.
    const resumed = at({ status: "running", startedAt: 1_000, pausedTotalSec: 10 });
    expect(remainingMs(resumed, 26_000)).toBe(25 * MIN - 15_000);
  });
});

describe("settings edits", () => {
  it("rejects a non-positive duration and applies a valid one to an idle phase", () => {
    expect(setPhaseSeconds(defaultTimer, "focus", 0)).toBe(defaultTimer);
    expect(setPhaseSeconds(defaultTimer, "focus", -5)).toBe(defaultTimer);
    const next = setPhaseSeconds(defaultTimer, "focus", 90);
    expect(next.focusSec).toBe(90);
    expect(next.plannedSec).toBe(90);

    const running = at({ status: "running", startedAt: 0 });
    const edited = setPhaseSeconds(running, "focus", 90);
    expect(edited.focusSec).toBe(90);
    expect(edited.plannedSec).toBe(25 * 60);
  });

  it("keeps the long-break interval an integer of at least 1", () => {
    expect(setLongBreakEvery(defaultTimer, 0)).toBe(defaultTimer);
    expect(setLongBreakEvery(defaultTimer, 2.5)).toBe(defaultTimer);
    const timer = at({ cycleIndex: 3 });
    expect(setLongBreakEvery(timer, 2).cycleIndex).toBe(2);
    expect(setLongBreakEvery(timer, 1).longBreakEvery).toBe(1);
  });

  it("flips one auto-start flag at a time", () => {
    const next = toggleAutoStart(defaultTimer, "focus");
    expect(next.autoStartFocus).toBe(true);
    expect(next.autoStartShortBreak).toBe(defaultTimer.autoStartShortBreak);
    expect(toggleAutoStart(next, "focus").autoStartFocus).toBe(false);
  });
});
