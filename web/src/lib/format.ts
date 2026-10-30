/** fa-IR uses Persian digits. Other app locales use their own numbering system. */
export function numberLocale(locale: string): string {
  return locale === "fa" ? "fa-IR" : locale;
}

/** Jalali calendar for Farsi. The numbering system stays Persian. */
export function dateLocale(locale: string): string {
  return locale === "fa" ? "fa-IR-u-ca-persian" : numberLocale(locale);
}

/** Clock digits. The caller renders this inside dir="ltr". */
export function formatClock(totalSeconds: number, locale: string): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  const padded = new Intl.NumberFormat(numberLocale(locale), { minimumIntegerDigits: 2 });
  return `${padded.format(minutes)}:${padded.format(seconds)}`;
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(numberLocale(locale)).format(value);
}

/** Hours and minutes, such as 70 → 1:10. Render inside dir="ltr". */
export function formatHourMinute(totalMinutes: number, locale: string): string {
  const safe = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  const tag = numberLocale(locale);
  const hourText = new Intl.NumberFormat(tag).format(hours);
  const minuteText = new Intl.NumberFormat(tag, { minimumIntegerDigits: 2 }).format(minutes);
  return `${hourText}:${minuteText}`;
}

/** A receipt code. Digits follow the locale; grouping commas are not added. */
export function formatCode(value: string, locale: string): string {
  const digit = new Intl.NumberFormat(numberLocale(locale), { useGrouping: false });
  return value.replace(/\d/g, (char) => digit.format(Number(char)));
}

/** Calendar date in the user's zone. Farsi uses the Jalali calendar. */
export function formatDate(date: Date, locale: string, timeZone = "Asia/Tehran"): string {
  return new Intl.DateTimeFormat(dateLocale(locale), {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone,
  }).format(date);
}
