// Decides what a verify result means, then grants Pro at most once.
// The database lock lives in grant-db.ts. Tests pass an in-memory lock instead.

import { extendPro, type ProColumns } from "./extend-pro";
import type { PlanId } from "./plans";
import { ZarinpalUnavailable, type PaymentGateway, type VerifyResult } from "./zarinpal";

/** Codes that mean the session can never be paid. Anything else unexpected is tried again later. */
const DEFINITIVE_FAILURE = new Set([-50, -51, -53, -54, -55]);

export type VerifyClass = "paid" | "definitive" | "transient";

export function verifyOutcome(code: number): VerifyClass {
  if (code === 100 || code === 101) return "paid";
  if (DEFINITIVE_FAILURE.has(code)) return "definitive";
  return "transient";
}

/** What to do with a PENDING row older than 15 minutes. Transient errors stay PENDING. */
export function reconcileDecision(
  authority: string | null,
  outcome: VerifyClass | "unreachable",
): "settle" | "expire" | "keep" {
  if (!authority) return "expire";
  if (outcome === "paid") return "settle";
  if (outcome === "definitive") return "expire";
  return "keep";
}

export type PaidWrite = {
  refId: string | null;
  cardPan: string | null;
  verifiedAt: Date;
  user: ProColumns;
};

/**
 * Runs `write` only when this payment is not already PAID.
 * The real implementation locks the row with SELECT … FOR UPDATE so two callbacks
 * cannot both pass that check.
 */
export interface GrantLock {
  once(paymentId: string, write: (current: ProColumns) => PaidWrite): Promise<"granted" | "already_paid">;
}

export type GrantOutcome =
  | { kind: "success" }
  | { kind: "failed"; code: number }
  | { kind: "pending" };

type Checkout = {
  id: string;
  amountToman: number;
  authority: string;
  plan: PlanId;
};

/**
 * Always asks Zarinpal. 100 and 101 both count as paid, but `lock.once` writes Pro
 * only the first time. A network failure stays pending so a later run can verify.
 */
export async function verifyAndGrant(options: {
  gateway: Pick<PaymentGateway, "verify">;
  lock: GrantLock;
  payment: Checkout;
  now: Date;
}): Promise<GrantOutcome> {
  let result: VerifyResult;
  try {
    // The amount is the one we stored, never the one in the callback query string.
    result = await options.gateway.verify({
      amountToman: options.payment.amountToman,
      authority: options.payment.authority,
    });
  } catch (error) {
    if (error instanceof ZarinpalUnavailable) return { kind: "pending" };
    throw error;
  }

  const outcome = verifyOutcome(result.code);
  if (outcome === "transient") return { kind: "pending" };
  if (outcome === "definitive") return { kind: "failed", code: result.code };

  await options.lock.once(options.payment.id, (current) => ({
    refId: result.refId,
    cardPan: result.cardPan,
    verifiedAt: options.now,
    user: extendPro(current, options.payment.plan, options.now),
  }));
  return { kind: "success" };
}
