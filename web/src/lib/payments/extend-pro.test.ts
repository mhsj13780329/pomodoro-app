import { describe, expect, it } from "vitest";
import { extendPro } from "./extend-pro";
import { MONTH_DAYS, YEAR_DAYS } from "./plans";

const NOW = new Date("2026-10-30T12:00:00Z");
const DAY = 86_400_000;

describe("extendPro", () => {
  it("starts a fresh month from now", () => {
    const next = extendPro({ proUntil: null, proLifetime: false }, "MONTH", NOW);
    expect(next.proLifetime).toBe(false);
    expect(next.proUntil?.toISOString()).toBe(new Date(NOW.getTime() + MONTH_DAYS * DAY).toISOString());
  });

  it("stacks a year on top of days that are still left", () => {
    const current = new Date(NOW.getTime() + 10 * DAY);
    const next = extendPro({ proUntil: current, proLifetime: false }, "YEAR", NOW);
    expect(next.proLifetime).toBe(false);
    expect(next.proUntil?.toISOString()).toBe(new Date(current.getTime() + YEAR_DAYS * DAY).toISOString());
  });

  it("starts from now once the previous plan has expired", () => {
    const expired = new Date(NOW.getTime() - DAY);
    const next = extendPro({ proUntil: expired, proLifetime: false }, "MONTH", NOW);
    expect(next.proUntil?.toISOString()).toBe(new Date(NOW.getTime() + MONTH_DAYS * DAY).toISOString());
  });

  it("leaves a lifetime account unchanged", () => {
    const until = new Date(NOW.getTime() - DAY);
    const next = extendPro({ proUntil: until, proLifetime: true }, "MONTH", NOW);
    expect(next).toEqual({ proUntil: until, proLifetime: true });
    const again = extendPro({ proUntil: until, proLifetime: true }, "LIFETIME", NOW);
    expect(again).toEqual({ proUntil: until, proLifetime: true });
  });

  it("sets lifetime without moving the old end date", () => {
    const until = new Date(NOW.getTime() + 5 * DAY);
    const next = extendPro({ proUntil: until, proLifetime: false }, "LIFETIME", NOW);
    expect(next).toEqual({ proUntil: until, proLifetime: true });
  });
});
