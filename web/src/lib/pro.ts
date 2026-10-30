// Pro access, as plain functions with no database import so they are easy to test.
// The database read lives in entitlement.ts (server-only). Phase 7 (payments) only has to
// write User.proUntil / User.proLifetime; every check below keeps working unchanged.

export type Entitlement = {
  /** Pro until this moment (monthly / yearly plans). */
  proUntil: Date | string | null;
  /** Lifetime plan. Never expires. */
  proLifetime: boolean | null;
};

export class ProRequiredError extends Error {
  constructor() {
    super("This needs a Pro account");
    this.name = "ProRequiredError";
  }
}

/** True for a lifetime plan, or while proUntil is still in the future. */
export function isProActive(entitlement: Entitlement, now: number = Date.now()): boolean {
  if (entitlement.proLifetime === true) return true;
  if (entitlement.proUntil == null) return false;
  const until = new Date(entitlement.proUntil).getTime();
  return Number.isFinite(until) && until > now;
}

/**
 * Throws ProRequiredError unless the account is Pro.
 * Call this on the server for every Pro-only write. Hiding a button is not enough:
 * anyone can call the API directly.
 */
export function requirePro(entitlement: Entitlement, now: number = Date.now()): void {
  if (!isProActive(entitlement, now)) throw new ProRequiredError();
}
