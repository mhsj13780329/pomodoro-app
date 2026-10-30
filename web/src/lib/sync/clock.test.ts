import { describe, expect, it } from "vitest";
import { adjustedNow } from "@/lib/timer/remaining";
import { medianOffset, pushClockSample } from "./clock";

describe("clock offset", () => {
  it("drops a slow sample and keeps a fast one", () => {
    const kept = pushClockSample([], -5 * 60_000, 200);
    expect(kept).toEqual([-5 * 60_000]);
    expect(pushClockSample(kept, 9_999, 1_500)).toEqual(kept);
  });

  it("uses the median of the last five samples", () => {
    let samples: number[] = [];
    for (const offset of [10, 1, 8, 3, 100, 4]) {
      samples = pushClockSample(samples, offset, 100);
    }
    expect(samples).toEqual([1, 8, 3, 100, 4]);
    expect(medianOffset(samples)).toBe(4);
  });

  it("averages the two middle samples when the count is even", () => {
    expect(medianOffset([10, 30])).toBe(20);
  });

  it("cancels a clock that is five minutes fast", () => {
    const offset = medianOffset(pushClockSample([], -5 * 60_000, 80));
    const deviceNow = 1_000_000 + 5 * 60_000;
    expect(adjustedNow(deviceNow, offset)).toBe(1_000_000);
  });
});
