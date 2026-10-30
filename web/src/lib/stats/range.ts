// Which ranges a free account may ask for. No database import, so the route and
// the tests share one rule: last 7 local days, plus the current calendar month
// through today. Anything older, or a breakdown, or an export, needs Pro.

import { addCivilDays, civilKey, compareCivil, parseCivil } from "./calendar";

export type RangeDecision =
  | { ok: true; from: string; to: string }
  | { ok: false; reason: "invalid" | "pro" };

/**
 * `monthStart` is day 1 of the current month in the user's calendar, written as
 * a Gregorian civil key. The route computes that; this function only compares keys.
 * Days after `today` are cut off, not rejected: the heatmap asks for the whole
 * month, and the future cells are empty on purpose.
 */
export function decideRange(input: {
  from: string;
  to: string;
  today: string;
  monthStart: string;
  breakdown: boolean;
  export: boolean;
  pro: boolean;
}): RangeDecision {
  const from = parseCivil(input.from);
  const to = parseCivil(input.to);
  const today = parseCivil(input.today);
  const monthStart = parseCivil(input.monthStart);
  if (!from || !to || !today || !monthStart) return { ok: false, reason: "invalid" };
  if (compareCivil(from, to) > 0) return { ok: false, reason: "invalid" };

  const end = compareCivil(to, today) > 0 ? today : to;
  // The whole request is still in the future.
  if (compareCivil(from, end) > 0) return { ok: false, reason: "invalid" };

  const last7Start = addCivilDays(today, -6);
  const freeStart = compareCivil(last7Start, monthStart) < 0 ? last7Start : monthStart;
  const outside = compareCivil(from, freeStart) < 0;
  if ((outside || input.breakdown || input.export) && !input.pro) return { ok: false, reason: "pro" };
  return { ok: true, from: civilKey(from), to: civilKey(end) };
}

/** The earliest local day a free account can see, through today. */
export function freeWindow(today: string, monthStart: string): { from: string; to: string } | null {
  const decision = decideRange({
    from: today,
    to: today,
    today,
    monthStart,
    breakdown: false,
    export: false,
    pro: false,
  });
  if (!decision.ok) return null;
  const todayDate = parseCivil(today);
  const month = parseCivil(monthStart);
  if (!todayDate || !month) return null;
  const last7Start = addCivilDays(todayDate, -6);
  const from = compareCivil(last7Start, month) < 0 ? last7Start : month;
  return { from: civilKey(from), to: today };
}
