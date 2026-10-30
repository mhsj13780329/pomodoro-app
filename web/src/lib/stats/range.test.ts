import { describe, expect, it } from "vitest";
import { decideRange, freeWindow } from "./range";

const today = "2026-10-30";
const monthStart = "2026-10-01";

function decide(partial: Partial<Parameters<typeof decideRange>[0]> = {}) {
  return decideRange({
    from: monthStart,
    to: today,
    today,
    monthStart,
    breakdown: false,
    export: false,
    pro: false,
    ...partial,
  });
}

describe("Pro range gating", () => {
  it("lets a free account read the current month and the last 7 days", () => {
    expect(decide()).toEqual({ ok: true, from: monthStart, to: today });
    expect(freeWindow(today, monthStart)).toEqual({ from: monthStart, to: today });
  });

  it("clamps a future end to today instead of rejecting the month", () => {
    expect(decide({ to: "2026-10-31" })).toEqual({ ok: true, from: monthStart, to: today });
  });

  it("refuses a free account a day older than the current month", () => {
    expect(decide({ from: "2026-09-30", to: today })).toEqual({ ok: false, reason: "pro" });
  });

  it("still allows the last 7 days when they reach into the previous month", () => {
    const early = "2026-10-03";
    expect(decide({ from: "2026-09-27", to: early, today: early })).toEqual({
      ok: true,
      from: "2026-09-27",
      to: early,
    });
    expect(decide({ from: "2026-09-26", to: early, today: early })).toEqual({ ok: false, reason: "pro" });
  });

  it("refuses breakdown and export for a free account, and allows them for Pro", () => {
    expect(decide({ breakdown: true })).toEqual({ ok: false, reason: "pro" });
    expect(decide({ export: true })).toEqual({ ok: false, reason: "pro" });
    expect(decide({ from: "2024-01-01", to: today, breakdown: true, export: true, pro: true })).toEqual({
      ok: true,
      from: "2024-01-01",
      to: today,
    });
  });

  it("rejects a date that is not a real day", () => {
    expect(decide({ from: "2026-02-31" })).toEqual({ ok: false, reason: "invalid" });
    expect(decide({ from: "2026-11-01", to: "2026-11-02" })).toEqual({ ok: false, reason: "invalid" });
  });
});
