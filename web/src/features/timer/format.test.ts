import { describe, expect, it } from "vitest";
import { formatClock, formatSession } from "./format";

describe("Persian formatting", () => {
  it("writes the clock with Persian digits", () => {
    expect(formatClock(16 * 60 + 10)).toBe("۱۶:۱۰");
    expect(formatClock(3 * 60 + 5)).toBe("۰۳:۰۵");
  });

  it("writes the session line with Persian digits", () => {
    expect(formatSession(3, 4)).toBe("جلسه ۳ از ۴");
  });
});
