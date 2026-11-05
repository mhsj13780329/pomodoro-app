import { describe, expect, it } from "vitest";
import { buildPayload, isDue } from "./payload";

const startedAt = new Date("2026-11-05T10:00:00.000Z");
const base = { status: "RUNNING" as const, startedAt, plannedSec: 1500, pausedTotalSec: 60 };
const end = startedAt.getTime() + 1560_000;

describe("isDue", () => {
  it("is due at and after start + planned + paused total", () => {
    expect(isDue(base, end - 1)).toBe(false);
    expect(isDue(base, end)).toBe(true);
    expect(isDue(base, end + 5000)).toBe(true);
  });

  it("is never due while paused or idle", () => {
    expect(isDue({ ...base, status: "PAUSED" }, end + 1000)).toBe(false);
    expect(isDue({ ...base, status: "IDLE" }, end + 1000)).toBe(false);
  });
});

describe("buildPayload", () => {
  it("says started when the next phase is running and ready when it waits", () => {
    const started = buildPayload("en", "shortBreak", "running");
    const ready = buildPayload("en", "focus", "idle");
    expect(started.title).toBe("Short break");
    expect(started.body).not.toBe(ready.body);
    expect(started).toMatchObject({ tag: "phase-end", url: "/en" });
  });

  it("falls back to fa for an unknown locale", () => {
    const payload = buildPayload("xx", "focus", "idle");
    expect(payload.url).toBe("/fa");
    expect(payload.title).toBe("تمرکز");
  });
});
