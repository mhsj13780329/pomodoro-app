// Local dates for stats. One implementation for the server and the browser, so a
// timezone with daylight saving cannot disagree with the API. No date library:
// Intl knows the zone, and for Farsi it knows the Jalali calendar.

export type CivilDate = { year: number; month: number; day: number };

/** Gregorian for every locale except Farsi, which uses the Jalali calendar. */
export type CalendarId = "gregory" | "persian";

export type MonthCell = {
  /** Gregorian civil date in the user's zone, `YYYY-MM-DD`. This is the API key. */
  key: string;
  date: CivilDate;
  inMonth: boolean;
};

export function calendarForLocale(locale: string): CalendarId {
  return locale === "fa" ? "persian" : "gregory";
}

/** A bad or empty zone must not throw in the middle of a render. Tehran is the product default. */
export function validTimeZone(timeZone: string | null | undefined): string {
  if (timeZone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
      return timeZone;
    } catch {
      // Fall through to the default.
    }
  }
  return "Asia/Tehran";
}

export function civilKey(date: CivilDate): string {
  const pad = (value: number, width: number) => String(value).padStart(width, "0");
  return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;
}

/** `YYYY-MM-DD`, or null when the string is not a real Gregorian day. */
export function parseCivil(value: string): CivilDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return { year, month, day };
}

export function compareCivil(a: CivilDate, b: CivilDate): number {
  return civilKey(a) < civilKey(b) ? -1 : civilKey(a) > civilKey(b) ? 1 : 0;
}

/** Gregorian day arithmetic. The key is already a civil date, so this needs no timezone. */
export function addCivilDays(date: CivilDate, days: number): CivilDate {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

/** 0 = Sunday … 6 = Saturday. A Gregorian civil date has the same weekday in every zone. */
export function weekdaySunday0(date: CivilDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

type Wall = CivilDate & { hour: number; minute: number; second: number };

function wallClock(instant: Date, timeZone: string, calendar: CalendarId): Wall {
  const locale = calendar === "persian" ? "en-US-u-ca-persian" : "en-US";
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone,
    calendar,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(instant);
  const bag: Record<string, string> = {};
  for (const part of parts) bag[part.type] = part.value;
  let hour = Number(bag.hour);
  let day = Number(bag.day);
  let month = Number(bag.month);
  let year = Number(bag.year);
  // Some engines report midnight as hour 24 on the previous day. That is 00:00 next day.
  if (hour === 24) {
    hour = 0;
    const next = addCivilDays({ year, month, day }, calendar === "gregory" ? 1 : 0);
    if (calendar === "gregory") {
      year = next.year;
      month = next.month;
      day = next.day;
    }
  }
  return { year, month, day, hour, minute: Number(bag.minute), second: Number(bag.second) };
}

/** How far the zone's wall clock is ahead of UTC, at this instant. DST changes this. */
function offsetMs(instant: Date, timeZone: string): number {
  const wall = wallClock(instant, timeZone, "gregory");
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return asUtc - instant.getTime();
}

function zonedInstant(date: CivilDate, hour: number, timeZone: string): Date {
  const guess = Date.UTC(date.year, date.month - 1, date.day, hour, 0, 0);
  // Two passes: the first offset can be the wrong side of a DST change.
  let instant = guess - offsetMs(new Date(guess), timeZone);
  const again = guess - offsetMs(new Date(instant), timeZone);
  if (again !== instant) instant = again;
  return new Date(instant);
}

/** Local midnight as a UTC instant. The day boundary the streak and the heatmap share. */
export function localMidnight(date: CivilDate, timeZone: string): Date {
  return zonedInstant(date, 0, timeZone);
}

/** Noon, so a label never lands on a DST gap (those are at 1–3am, not midday). */
export function localNoon(date: CivilDate, timeZone: string): Date {
  return zonedInstant(date, 12, timeZone);
}

/** The Gregorian civil date of an instant in the user's zone. */
export function civilDate(instant: Date, timeZone: string): CivilDate {
  const wall = wallClock(instant, timeZone, "gregory");
  return { year: wall.year, month: wall.month, day: wall.day };
}

export function civilToday(now: Date, timeZone: string): string {
  return civilKey(civilDate(now, timeZone));
}

/** Year, month and day in the calendar the user reads (Jalali for Farsi). */
export function calendarDate(instant: Date, timeZone: string, calendar: CalendarId): CivilDate {
  const wall = wallClock(instant, timeZone, calendar);
  return { year: wall.year, month: wall.month, day: wall.day };
}

/** First Gregorian civil day of the calendar month that contains `instant`. */
export function startOfCalendarMonth(instant: Date, timeZone: string, calendar: CalendarId): CivilDate {
  let cursor = civilDate(instant, timeZone);
  for (let i = 0; i < 40; i += 1) {
    const parts = calendarDate(localNoon(cursor, timeZone), timeZone, calendar);
    if (parts.day === 1) return cursor;
    cursor = addCivilDays(cursor, -1);
  }
  return civilDate(instant, timeZone);
}

export function daysInCalendarMonth(instant: Date, timeZone: string, calendar: CalendarId): number {
  const start = startOfCalendarMonth(instant, timeZone, calendar);
  const month = calendarDate(localNoon(start, timeZone), timeZone, calendar);
  let count = 1;
  let cursor = start;
  for (let i = 0; i < 40; i += 1) {
    const next = addCivilDays(cursor, 1);
    const parts = calendarDate(localNoon(next, timeZone), timeZone, calendar);
    if (parts.year !== month.year || parts.month !== month.month) return count;
    count += 1;
    cursor = next;
  }
  return count;
}

/** Move by whole calendar months. `+1` is the next Jalali month when the calendar is Persian. */
export function shiftCalendarMonth(instant: Date, delta: number, timeZone: string, calendar: CalendarId): Date {
  let cursor = localNoon(startOfCalendarMonth(instant, timeZone, calendar), timeZone);
  const step = delta >= 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(delta); i += 1) {
    const day1 = startOfCalendarMonth(cursor, timeZone, calendar);
    // 32 days is past the end of any month. One day back is the previous month.
    const probe = addCivilDays(day1, step > 0 ? 32 : -1);
    cursor = localNoon(startOfCalendarMonth(localNoon(probe, timeZone), timeZone, calendar), timeZone);
  }
  return cursor;
}

export function startOfCalendarYear(instant: Date, timeZone: string, calendar: CalendarId): CivilDate {
  let cursor = localNoon(startOfCalendarMonth(instant, timeZone, calendar), timeZone);
  for (let i = 0; i < 14; i += 1) {
    const parts = calendarDate(cursor, timeZone, calendar);
    if (parts.month === 1 && parts.day === 1) return civilDate(cursor, timeZone);
    const day1 = startOfCalendarMonth(cursor, timeZone, calendar);
    const prev = addCivilDays(day1, -1);
    cursor = localNoon(startOfCalendarMonth(localNoon(prev, timeZone), timeZone, calendar), timeZone);
  }
  return civilDate(instant, timeZone);
}

/**
 * 0 = Sunday … 6 = Saturday.
 * `Intl` reports Monday as 1 through Sunday as 7, so Sunday modulo 7 is 0.
 * Farsi falls back to Saturday if the runtime has no week info.
 */
export function weekStartsOn(locale: string): number {
  try {
    const tag = locale === "fa" ? "fa-IR" : locale;
    const loc = new Intl.Locale(tag) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const info = typeof loc.getWeekInfo === "function" ? loc.getWeekInfo() : loc.weekInfo;
    if (info && info.firstDay >= 1 && info.firstDay <= 7) return info.firstDay % 7;
  } catch {
    // Use the fallback below.
  }
  return locale === "fa" ? 6 : 0;
}

/** Calendar month laid out as up to 6 weeks. Days outside the month stay in the grid so columns line up. */
export function monthGrid(instant: Date, timeZone: string, calendar: CalendarId, weekStart: number): {
  year: number;
  month: number;
  dayCount: number;
  cells: MonthCell[];
} {
  const start = startOfCalendarMonth(instant, timeZone, calendar);
  const parts = calendarDate(localNoon(start, timeZone), timeZone, calendar);
  const dayCount = daysInCalendarMonth(instant, timeZone, calendar);
  const lead = (weekdaySunday0(start) - weekStart + 7) % 7;
  const cells: MonthCell[] = [];
  for (let i = 0; i < lead; i += 1) {
    const date = addCivilDays(start, i - lead);
    cells.push({ key: civilKey(date), date, inMonth: false });
  }
  for (let i = 0; i < dayCount; i += 1) {
    const date = addCivilDays(start, i);
    cells.push({ key: civilKey(date), date, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const date = addCivilDays(start, cells.length - lead);
    cells.push({ key: civilKey(date), date, inMonth: false });
  }
  return { year: parts.year, month: parts.month, dayCount, cells };
}

/**
 * One calendar year as week columns (GitHub's shape). Each column has 7 rows,
 * starting on `weekStart`. Nulls are the days before day 1 and after the last day.
 */
export function yearWeeks(instant: Date, timeZone: string, calendar: CalendarId, weekStart: number): {
  year: number;
  weeks: (MonthCell | null)[][];
} {
  const start = startOfCalendarYear(instant, timeZone, calendar);
  const next = shiftCalendarMonth(localNoon(start, timeZone), 12, timeZone, calendar);
  const end = addCivilDays(startOfCalendarMonth(next, timeZone, calendar), -1);
  const parts = calendarDate(localNoon(start, timeZone), timeZone, calendar);
  const lead = (weekdaySunday0(start) - weekStart + 7) % 7;
  const days: (CivilDate | null)[] = [];
  for (let i = 0; i < lead; i += 1) days.push(null);
  let cursor = start;
  while (compareCivil(cursor, end) <= 0) {
    days.push(cursor);
    cursor = addCivilDays(cursor, 1);
    if (days.length > 400) break;
  }
  while (days.length % 7 !== 0) days.push(null);
  const weeks: (MonthCell | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(
      days.slice(i, i + 7).map((date) => (date ? { key: civilKey(date), date, inMonth: true } : null)),
    );
  }
  return { year: parts.year, weeks };
}

/** Inclusive list of Gregorian civil keys. Capped so a bad range cannot loop forever. */
export function eachDay(from: string, to: string): string[] {
  const start = parseCivil(from);
  const end = parseCivil(to);
  if (!start || !end || compareCivil(start, end) > 0) return [];
  const out: string[] = [];
  let cursor = start;
  for (let i = 0; i < 4000 && compareCivil(cursor, end) <= 0; i += 1) {
    out.push(civilKey(cursor));
    cursor = addCivilDays(cursor, 1);
  }
  return out;
}
