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

const WEEK_MS = 7 * 86_400_000;

/** "soon" while Pro ends within 7 days, "expired" once it has ended. Lifetime and never-Pro: none. */
export type BannerKind = "soon" | "expired";

/** Everything a page needs to say about an account's Pro, from the same two columns. */
export type ProStatus = {
  active: boolean;
  lifetime: boolean;
  /** When a month/year plan ends (or ended). Null for never-Pro. Lifetime may still carry an old date. */
  until: Date | null;
  banner: BannerKind | null;
};

export function proStatus(entitlement: Entitlement, now: number = Date.now()): ProStatus {
  const lifetime = entitlement.proLifetime === true;
  const raw = entitlement.proUntil == null ? null : new Date(entitlement.proUntil);
  const until = raw && Number.isFinite(raw.getTime()) ? raw : null;
  let banner: BannerKind | null = null;
  if (!lifetime && until) {
    const ms = until.getTime();
    if (ms > now && ms - now <= WEEK_MS) banner = "soon";
    else if (ms <= now) banner = "expired";
  }
  return { active: isProActive(entitlement, now), lifetime, until, banner };
}
