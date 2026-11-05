// When to show the in-app banner, and which account gets an SMS or an email.
// Dates are the user's local calendar day, not a raw 72-hour gap.

import { addCivilDays, civilDate, civilKey } from "@/lib/calendar";
import { gatewayEmail } from "./buyer";

export type ReminderKindName = "EXPIRING" | "EXPIRED";

/** EXPIRING on the local day three days before proUntil. EXPIRED on the day after it. */
export function reminderKind(proUntil: Date, timeZone: string, now: Date): ReminderKindName | null {
  const until = civilKey(civilDate(proUntil, timeZone));
  const today = civilDate(now, timeZone);
  if (until === civilKey(addCivilDays(today, 3))) return "EXPIRING";
  if (until === civilKey(addCivilDays(today, -1))) return "EXPIRED";
  return null;
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
