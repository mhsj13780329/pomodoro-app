import { describe, expect, it } from "vitest";
import { ProRequiredError, isProActive, proStatus, requirePro } from "./pro";

const NOW = Date.parse("2026-10-30T12:00:00Z");

describe("isProActive", () => {
  it("is false for a user who never paid", () => {
    expect(isProActive({ proUntil: null, proLifetime: false }, NOW)).toBe(false);
    expect(isProActive({ proUntil: null, proLifetime: null }, NOW)).toBe(false);
  });

  it("is true while proUntil is in the future", () => {
    expect(isProActive({ proUntil: new Date(NOW + 1000), proLifetime: false }, NOW)).toBe(true);
    expect(isProActive({ proUntil: "2027-01-01T00:00:00Z", proLifetime: false }, NOW)).toBe(true);
  });

  it("is false once proUntil has passed, including the exact moment", () => {
    expect(isProActive({ proUntil: new Date(NOW - 1000), proLifetime: false }, NOW)).toBe(false);
    expect(isProActive({ proUntil: new Date(NOW), proLifetime: false }, NOW)).toBe(false);
  });

  it("is true for a lifetime plan even with an old proUntil", () => {
    expect(isProActive({ proUntil: new Date(NOW - 1000), proLifetime: true }, NOW)).toBe(true);
    expect(isProActive({ proUntil: null, proLifetime: true }, NOW)).toBe(true);
  });

  it("treats an unreadable date as not Pro", () => {
    expect(isProActive({ proUntil: "nonsense", proLifetime: false }, NOW)).toBe(false);
  });
});

describe("requirePro", () => {
  it("throws ProRequiredError for a free user", () => {
    expect(() => requirePro({ proUntil: null, proLifetime: false }, NOW)).toThrow(ProRequiredError);
  });

  it("passes for a Pro user", () => {
    expect(() => requirePro({ proUntil: null, proLifetime: true }, NOW)).not.toThrow();
  });
});

describe("proStatus", () => {
  const DAY = 86_400_000;
  it("warns inside 7 days, stays quiet after that window, and notes an ended plan", () => {
    expect(proStatus({ proUntil: new Date(NOW + 3 * DAY), proLifetime: false }, NOW).banner).toBe("soon");
    expect(proStatus({ proUntil: new Date(NOW + 7 * DAY), proLifetime: false }, NOW).banner).toBe("soon");
    expect(proStatus({ proUntil: new Date(NOW + 8 * DAY), proLifetime: false }, NOW).banner).toBeNull();
    expect(proStatus({ proUntil: new Date(NOW - DAY), proLifetime: false }, NOW).banner).toBe("expired");
    expect(proStatus({ proUntil: null, proLifetime: false }, NOW).banner).toBeNull();
  });

  it("never shows a banner for lifetime, even with an old end date", () => {
    expect(proStatus({ proUntil: new Date(NOW - DAY), proLifetime: true }, NOW)).toEqual({
      active: true,
      lifetime: true,
      until: new Date(NOW - DAY),
      banner: null,
    });
  });

  it("agrees with isProActive and accepts an ISO string", () => {
    const status = proStatus({ proUntil: "2027-01-01T00:00:00Z", proLifetime: null }, NOW);
    expect(status.active).toBe(true);
    expect(status.lifetime).toBe(false);
    expect(status.until?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(proStatus({ proUntil: "not a date", proLifetime: false }, NOW)).toMatchObject({ active: false, until: null, banner: null });
  });
});
