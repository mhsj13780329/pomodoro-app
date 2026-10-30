import { describe, expect, it } from "vitest";
import { adjustedNow, canComplete, displaySeconds, remainingMs, type RemainingInput } from "./remaining";

const MIN = 60 * 1000;

function running(partial: Partial<RemainingInput> = {}): RemainingInput {
  return {
    status: "running",
    startedAt: 0,
    plannedSec: 25 * 60,
    pausedAt: null,
    pausedTotalSec: 0,
    ...partial,
  };
}

describe("remaining time", () => {
  it("shows the full duration while idle", () => {
    const idle: RemainingInput = {
      status: "idle",
      startedAt: null,
      plannedSec: 25 * 60,
      pausedAt: null,
      pausedTotalSec: 0,
    };
    expect(remainingMs(idle, 50_000)).toBe(25 * MIN);
    expect(displaySeconds(idle, 50_000)).toBe(25 * 60);
  });

  it("counts down from the start timestamp", () => {
    const timer = running({ startedAt: 1_000 });
    expect(remainingMs(timer, 1_000)).toBe(25 * MIN);
    expect(remainingMs(timer, 11_000)).toBe(25 * MIN - 10_000);
  });

  it("freezes while paused", () => {
    const paused = running({ status: "paused", startedAt: 1_000, pausedAt: 11_000 });
    const frozen = remainingMs(paused, 11_000);
    expect(remainingMs(paused, 50_000)).toBe(frozen);
  });

  it("ignores a device clock that is five minutes fast when the offset is applied", () => {
    const timer = running({ startedAt: 1_000 });
    const realNow = 61_000;
    const fastClock = realNow + 5 * MIN;
    const offset = -5 * MIN;
    expect(remainingMs(timer, adjustedNow(fastClock, offset))).toBe(remainingMs(timer, realNow));
  });

  it("keeps a paused timer frozen even if the device clock and the offset disagree", () => {
    const paused = running({ status: "paused", startedAt: 1_000, pausedAt: 11_000 });
    const fastClock = 50_000 + 5 * MIN;
    expect(remainingMs(paused, adjustedNow(fastClock, -5 * MIN))).toBe(remainingMs(paused, 11_000));
  });
});

describe("complete window", () => {
  it("allows the last three seconds and rejects an early complete", () => {
    const timer = running({ startedAt: 0, plannedSec: 60 });
    expect(canComplete(timer, 50_000)).toBe(false);
    expect(canComplete(timer, 57_000)).toBe(true);
    expect(canComplete(timer, 60_000)).toBe(true);
  });

  it("rejects a paused or idle timer", () => {
    expect(canComplete(running({ status: "paused", pausedAt: 60_000 }), 60_000)).toBe(false);
    expect(
      canComplete(
        { status: "idle", startedAt: null, plannedSec: 60, pausedAt: null, pausedTotalSec: 0 },
        60_000,
      ),
    ).toBe(false);
  });
});
