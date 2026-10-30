// When to show the in-app banner, and which account gets an SMS or an email.
// Dates are the user's local calendar day, not a raw 72-hour gap.

import { gatewayEmail } from "./buyer";

const WEEK_MS = 7 * 86_400_000;

export type ReminderKindName = "EXPIRING" | "EXPIRED";
export type BannerKind = "soon" | "expired";

/** YYYY-MM-DD in the given timezone. */
export function localDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shiftDay(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days)).toISOString().slice(0, 10);
}

/** EXPIRING on the local day three days before proUntil. EXPIRED on the day after it. */
export function reminderKind(proUntil: Date, timeZone: string, now: Date): ReminderKindName | null {
  const until = localDay(proUntil, timeZone);
  const today = localDay(now, timeZone);
  if (until === shiftDay(today, 3)) return "EXPIRING";
  if (until === shiftDay(today, -1)) return "EXPIRED";
  return null;
}

/** A banner while Pro ends within 7 days, and a quieter one after it has ended. */
export function expiryBannerKind(proUntil: Date | null, proLifetime: boolean, now: number): BannerKind | null {
  if (proLifetime || proUntil == null) return null;
  const until = proUntil.getTime();
  if (!Number.isFinite(until)) return null;
  if (until > now && until - now <= WEEK_MS) return "soon";
  if (until <= now) return "expired";
  return null;
}

export function bannerKindNow(proUntil: Date | null, proLifetime: boolean): BannerKind | null {
  return expiryBannerKind(proUntil, proLifetime, Date.now());
}

/** Phone accounts get SMS. Email accounts get mail. The fake phone address is never mailed. */
export function reminderTarget(user: {
  phoneNumber: string | null;
  email: string;
}): { channel: "SMS" | "EMAIL"; to: string } | null {
  if (user.phoneNumber) return { channel: "SMS", to: user.phoneNumber };
  const email = gatewayEmail(user.email);
  if (email) return { channel: "EMAIL", to: email };
  return null;
}
