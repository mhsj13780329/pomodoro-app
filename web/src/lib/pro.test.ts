import { describe, expect, it } from "vitest";
import { ProRequiredError, isProActive, requirePro } from "./pro";

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
