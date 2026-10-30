// The only place a price exists. The browser sends a plan id; the server looks the amount up here.

export const PLAN_IDS = ["MONTH", "YEAR", "LIFETIME"] as const;

export type PlanId = (typeof PLAN_IDS)[number];

/** Placeholder toman amounts. Change these when the real prices are decided. */
const AMOUNTS: Record<PlanId, number> = {
  MONTH: 49_000,
  YEAR: 399_000,
  LIFETIME: 990_000,
};

export const MONTH_DAYS = 30;
export const YEAR_DAYS = 365;

export type PlanOffer = {
  id: PlanId;
  amountToman: number;
};

export function isPlanId(value: string): value is PlanId {
  return (PLAN_IDS as readonly string[]).includes(value);
}

/** Null for anything that is not one of the three plan ids. */
export function getPlan(id: string): PlanOffer | null {
  if (!isPlanId(id)) return null;
  return { id, amountToman: AMOUNTS[id] };
}
