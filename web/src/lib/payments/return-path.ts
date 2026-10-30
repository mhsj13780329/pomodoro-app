import { isPlanId } from "./plans";

const HISTORY = "/settings/payments";

/**
 * Login may only send someone back to pricing, or to their own payment history.
 * Anything else is ignored so this cannot be an open redirect.
 */
export function loginReturnPath(next: string | null | undefined): string | null {
  if (next === HISTORY) return HISTORY;
  return pricingReturnPath(next);
}

/**
 * Login may only send someone back to the pricing page.
 * Anything else (another site, another path) is ignored so this cannot be an open redirect.
 */
export function pricingReturnPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  let url: URL;
  try {
    url = new URL(next, "http://local.test");
  } catch {
    return null;
  }
  if (url.origin !== "http://local.test" || url.pathname !== "/pricing") return null;
  const plan = url.searchParams.get("plan");
  if (plan !== null && !isPlanId(plan)) return null;
  if ([...url.searchParams.keys()].some((key) => key !== "plan")) return null;
  return plan ? `/pricing?plan=${plan}` : "/pricing";
}
