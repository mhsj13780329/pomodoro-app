// How a paid plan moves proUntil / proLifetime. No database import, so the cases are unit-tested.
// requirePro() only reads those two columns; this is the only writer of the new values.

import { MONTH_DAYS, YEAR_DAYS, type PlanId } from "./plans";

const DAY_MS = 86_400_000;

export type ProColumns = {
  proUntil: Date | null;
  proLifetime: boolean;
};

/**
 * MONTH adds 30 days and YEAR adds 365, starting from max(now, proUntil), so an early
 * renewal keeps the days already paid for. LIFETIME sets the flag and leaves proUntil.
 * An account that is already lifetime is returned unchanged, so a month can never clear it.
 */
export function extendPro(current: ProColumns, plan: PlanId, now: Date): ProColumns {
  if (current.proLifetime) {
    return { proUntil: current.proUntil, proLifetime: true };
  }
  if (plan === "LIFETIME") {
    return { proUntil: current.proUntil, proLifetime: true };
  }
  const days = plan === "MONTH" ? MONTH_DAYS : YEAR_DAYS;
  const untilMs = current.proUntil?.getTime() ?? Number.NEGATIVE_INFINITY;
  const base = untilMs > now.getTime() ? untilMs : now.getTime();
  return { proUntil: new Date(base + days * DAY_MS), proLifetime: false };
}
