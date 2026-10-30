import { dateLocale } from "@/lib/format";

/** Weekday names in column order, starting on `weekStart` (0 = Sunday … 6 = Saturday). */
export function weekdayNames(locale: string, weekStart: number, style: "short" | "long"): string[] {
  const format = new Intl.DateTimeFormat(dateLocale(locale), { weekday: style, timeZone: "UTC" });
  const origin = Date.UTC(2026, 9, 4, 12);
  const originDay = new Date(origin).getUTCDay();
  return Array.from({ length: 7 }, (_, index) => {
    const weekday = (weekStart + index) % 7;
    const delta = (weekday - originDay + 7) % 7;
    return format.format(new Date(origin + delta * 86_400_000));
  });
}

export function monthTitle(instant: Date, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(dateLocale(locale), {
    month: "long",
    year: "numeric",
    timeZone,
  }).format(instant);
}

export function dayNumber(instant: Date, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(dateLocale(locale), {
    day: "numeric",
    timeZone,
  }).format(instant);
}
