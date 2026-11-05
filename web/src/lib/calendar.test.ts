import { describe, expect, it } from "vitest";
import {
  addCivilDays,
  calendarDate,
  calendarForLocale,
  civilDate,
  civilKey,
  daysInCalendarMonth,
  localMidnight,
  monthGrid,
  parseCivil,
  startOfCalendarMonth,
  weekStartsOn,
  yearWeeks,
} from "./calendar";

const TEHRAN = "Asia/Tehran";
const NEW_YORK = "America/New_York";

describe("civil dates", () => {
  it("rejects a day that does not exist", () => {
    expect(parseCivil("2026-02-31")).toBeNull();
    expect(parseCivil("2026-10-30")).toEqual({ year: 2026, month: 10, day: 30 });
  });

  it("adds days across a month end", () => {
    expect(civilKey(addCivilDays({ year: 2026, month: 10, day: 30 }, 2))).toBe("2026-11-01");
  });
});

describe("local day in a timezone", () => {
  it("uses the Tehran offset, which is +3:30 and has no daylight saving", () => {
    // 20:30 UTC is exactly midnight at the start of 31 Oct in Tehran.
    expect(civilKey(civilDate(new Date("2026-10-30T20:29:59.000Z"), TEHRAN))).toBe("2026-10-30");
    expect(civilKey(civilDate(new Date("2026-10-30T20:30:00.000Z"), TEHRAN))).toBe("2026-10-31");
    expect(localMidnight({ year: 2026, month: 10, day: 31 }, TEHRAN).toISOString()).toBe("2026-10-30T20:30:00.000Z");
  });

  it("follows daylight saving in New York", () => {
    // 2026-03-08 is the spring-forward. Midnight is still EST (UTC-5). The next midnight is EDT (UTC-4).
    expect(localMidnight({ year: 2026, month: 3, day: 8 }, NEW_YORK).toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(localMidnight({ year: 2026, month: 3, day: 9 }, NEW_YORK).toISOString()).toBe("2026-03-09T04:00:00.000Z");
    // 2026-11-01 is the fall-back. Midnight is still EDT. The next midnight is EST.
    expect(localMidnight({ year: 2026, month: 11, day: 1 }, NEW_YORK).toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(localMidnight({ year: 2026, month: 11, day: 2 }, NEW_YORK).toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("puts a session that crosses midnight on the day it ended", () => {
    // 23:40 on 7 Mar EST, ending 00:10 on 8 Mar EST.
    const endedAt = new Date("2026-03-08T05:10:00.000Z");
    expect(civilKey(civilDate(endedAt, NEW_YORK))).toBe("2026-03-08");
    const startedAt = new Date("2026-03-08T04:40:00.000Z");
    expect(civilKey(civilDate(startedAt, NEW_YORK))).toBe("2026-03-07");
  });
});

describe("Jalali months", () => {
  it("uses the Persian calendar only for fa", () => {
    expect(calendarForLocale("fa")).toBe("persian");
    expect(calendarForLocale("en")).toBe("gregory");
  });

  it("starts Farvardin 1405 on 21 March 2026, a Saturday", () => {
    const nowruz = new Date("2026-03-21T12:00:00Z");
    expect(calendarDate(nowruz, TEHRAN, "persian")).toEqual({ year: 1405, month: 1, day: 1 });
    expect(civilKey(startOfCalendarMonth(nowruz, TEHRAN, "persian"))).toBe("2026-03-21");
    expect(daysInCalendarMonth(nowruz, TEHRAN, "persian")).toBe(31);
    const grid = monthGrid(nowruz, TEHRAN, "persian", weekStartsOn("fa"));
    expect(grid.year).toBe(1405);
    expect(grid.month).toBe(1);
    expect(grid.cells[0]).toMatchObject({ key: "2026-03-21", inMonth: true });
    expect(grid.cells.filter((cell) => cell.inMonth)).toHaveLength(31);
    expect(grid.cells.length % 7).toBe(0);
    expect(grid.cells.length).toBeLessThanOrEqual(42);
  });

  it("gives Esfand 30 days in the leap year 1403 and 29 days in 1404", () => {
    // ICU's Persian calendar: 20 March 2025 is 30 Esfand 1403 (leap), and
    // 20 March 2026 is 29 Esfand 1404. The next day is 1 Farvardin.
    const esfand1403 = new Date("2025-03-20T12:00:00Z");
    const esfand1404 = new Date("2026-03-20T12:00:00Z");
    expect(calendarDate(esfand1403, TEHRAN, "persian")).toEqual({ year: 1403, month: 12, day: 30 });
    expect(daysInCalendarMonth(esfand1403, TEHRAN, "persian")).toBe(30);
    expect(calendarDate(esfand1404, TEHRAN, "persian")).toEqual({ year: 1404, month: 12, day: 29 });
    expect(daysInCalendarMonth(esfand1404, TEHRAN, "persian")).toBe(29);
    const next = calendarDate(new Date("2026-03-21T12:00:00Z"), TEHRAN, "persian");
    expect(next).toEqual({ year: 1405, month: 1, day: 1 });
  });

  it("starts the Farsi week on Saturday and the English week on Sunday", () => {
    expect(weekStartsOn("fa")).toBe(6);
    expect(weekStartsOn("en")).toBe(0);
  });

  it("covers a whole Jalali year without dropping Esfand", () => {
    const weeks = yearWeeks(new Date("2026-03-21T12:00:00Z"), TEHRAN, "persian", 6);
    expect(weeks.year).toBe(1405);
    const keys = weeks.weeks.flat().flatMap((cell) => (cell ? [cell.key] : []));
    expect(keys[0]).toBe("2026-03-21");
    expect(keys[keys.length - 1]).toBe("2027-03-20");
    expect(keys).toHaveLength(365);
    for (const week of weeks.weeks) expect(week).toHaveLength(7);
  });
});
