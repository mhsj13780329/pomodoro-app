import { describe, expect, it } from "vitest";
import { formatClock, formatDate, formatHourMinute, formatNumber } from "./format";

const nowruz = new Date("2026-03-21T12:00:00Z");

describe("locale formatting", () => {
  it("uses Persian digits for fa and Western digits for en", () => {
    expect(formatNumber(3, "fa")).toBe("۳");
    expect(formatNumber(3, "en")).toBe("3");
    expect(formatClock(16 * 60 + 10, "fa")).toBe("۱۶:۱۰");
    expect(formatClock(16 * 60 + 10, "en")).toBe("16:10");
    expect(formatHourMinute(70, "fa")).toBe("۱:۱۰");
    expect(formatHourMinute(70, "en")).toBe("1:10");
  });

  it("writes a Jalali date with Persian digits for fa", () => {
    expect(formatDate(nowruz, "fa")).toBe("۱ فروردین ۱۴۰۵");
  });

  it("writes a Gregorian date for en", () => {
    expect(formatDate(nowruz, "en")).toBe("March 21, 2026");
  });
});
