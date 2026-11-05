import { dateLocale, formatNumber } from "@/lib/format";

/** Calendar day key in the device's zone, so "today" matches what the user sees. */
const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

/**
 * The note's date as the design shows it: "today, 10:24", "yesterday", or a day and month
 * (Jalali for Farsi). `labels` holds the translated "today, {time}" and "yesterday" texts.
 */
export function noteDate(
  iso: string,
  locale: string,
  labels: { today: (time: string) => string; yesterday: string },
  now = new Date(),
): string {
  const date = new Date(iso);
  if (dayKey(date) === dayKey(now)) {
    const time = new Intl.DateTimeFormat(dateLocale(locale), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
    return labels.today(time);
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(date) === dayKey(yesterday)) return labels.yesterday;
  const sameYear = new Intl.DateTimeFormat(dateLocale(locale), { year: "numeric" });
  return new Intl.DateTimeFormat(dateLocale(locale), {
    day: "numeric",
    month: "long",
    ...(sameYear.format(date) === sameYear.format(now) ? {} : { year: "numeric" }),
  }).format(date);
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export { formatNumber };
