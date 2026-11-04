// The one module that changes a Payment's status. Routes and the reconcile script
// only translate HTTP / CLI into these three calls.
//
// Prisma is used directly (tests run against a real Postgres). The gateway is the seam.
// Not marked `server-only`: scripts/reconcile-payments.ts imports this in plain Node,
// the same reason prisma.ts is not. Client components must not import it.

import { defaultLocale, isLocale } from "@/i18n/routing";
import { prisma } from "@/lib/prisma";
import { gatewayEmail, gatewayMobile } from "./buyer";
import { gatewayDescription } from "./description";
import { extendPro, type ProColumns } from "./extend-pro";
import { PaymentConfigError } from "./payment-env";
import { getPlan, isPlanId, type PlanId } from "./plans";
import { ZarinpalError, ZarinpalUnavailable, type PaymentGateway, type VerifyResult } from "./zarinpal";

/** Codes that mean the session can never be paid. Anything else unexpected is tried again later. */
const DEFINITIVE_FAILURE = new Set([-50, -51, -53, -54, -55]);

export type ReturnOutcome = "success" | "failed" | "cancelled" | "pending" | "unknown";

export type BeginResult =
  | { ok: true; url: string }
  | { ok: false; error: "unauthorized" | "lifetime" | "invalid_plan" | "gateway" | "unavailable" };

export type ReturnResult = {
  outcome: ReturnOutcome;
  paymentId: string | null;
  /** The page locale stored on the row. Null when the authority is unknown. */
  locale: string | null;
};

export type ReconcileResult = { settled: number; expired: number; kept: number };

export type Checkout = {
  /** `locale` is the buyer's preferred page locale (cookie); the account's locale is the fallback. */
  beginCheckout(input: { userId: string; planId: string; locale?: string; appUrl: string }): Promise<BeginResult>;
  /** Zarinpal sends the buyer's browser back. Nothing in the query string is trusted. */
  handleReturn(input: { authority: string; status: string }): Promise<ReturnResult>;
  /** Re-verifies PENDING rows created before `olderThan`. Safe to run again. */
  reconcilePending(input: { olderThan: Date }): Promise<ReconcileResult>;
};

export function createCheckout(deps: { gateway: PaymentGateway; now?: () => Date }): Checkout {
  const now = deps.now ?? (() => new Date());
  const { gateway } = deps;

  type Verdict = { kind: "paid" } | { kind: "failed"; code: number } | { kind: "pending" };

  type Row = { id: string; plan: PlanId; amountToman: number; authority: string };

  /** Always asks the gateway. 100 and 101 both mean paid; the grant itself happens once. */
  async function verify(row: Row): Promise<Verdict> {
    let result: VerifyResult;
    try {
      // The amount is the one we stored, never the one in the callback query string.
      result = await gateway.verify({ amountToman: row.amountToman, authority: row.authority });
    } catch (error) {
      if (error instanceof ZarinpalUnavailable) return { kind: "pending" };
      throw error;
    }
    if (result.code === 100 || result.code === 101) {
      await grantOnce(row, result);
      return { kind: "paid" };
    }
    if (DEFINITIVE_FAILURE.has(result.code)) return { kind: "failed", code: result.code };
    return { kind: "pending" };
  }

  /**
   * Locks the payment, then the user, until the transaction ends. A second callback (a refresh,
   * or the reconcile script) waits, then sees PAID and does not add the days again. The user
   * lock stops two different payments reading the same proUntil and each adding from it.
   */
  async function grantOnce(row: Row, result: VerifyResult): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ status: string; userId: string }>>`
        SELECT "status", "userId" FROM "Payment" WHERE "id" = ${row.id} FOR UPDATE
      `;
      const payment = locked[0];
      if (!payment || payment.status === "PAID") return;

      await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${payment.userId} FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: payment.userId },
        select: { proUntil: true, proLifetime: true },
      });
      const current: ProColumns = { proUntil: user?.proUntil ?? null, proLifetime: user?.proLifetime === true };
      const at = now();
      const next = extendPro(current, row.plan, at);
      // Status, receipt and Pro move together. A crash rolls all of them back.
      await tx.payment.update({
        where: { id: row.id },
        data: { status: "PAID", refId: result.refId, cardPan: result.cardPan, verifiedAt: at, errorCode: null },
      });
      await tx.user.update({
        where: { id: payment.userId },
        data: { proUntil: next.proUntil, proLifetime: next.proLifetime },
      });
    });
  }

  /** Marks a checkout failed unless it was already paid. A late success must not be overwritten. */
  async function failUnlessPaid(paymentId: string, errorCode: number | null): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT "status" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE
      `;
      if (!locked[0] || locked[0].status === "PAID") return;
      await tx.payment.update({ where: { id: paymentId }, data: { status: "FAILED", errorCode } });
    });
  }

  /** An old PENDING row that will never be paid. PAID and FAILED rows are left alone. */
  async function expireIfPending(paymentId: string, errorCode: number | null): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT "status" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE
      `;
      if (locked[0]?.status !== "PENDING") return;
      await tx.payment.update({ where: { id: paymentId }, data: { status: "EXPIRED", errorCode } });
    });
  }

  return {
    async beginCheckout({ userId, planId, locale, appUrl }) {
      const offer = getPlan(planId);
      if (!offer) return { ok: false, error: "invalid_plan" };

      const account = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, phoneNumber: true, locale: true, proLifetime: true },
      });
      if (!account) return { ok: false, error: "unauthorized" };
      // A lifetime account has nothing left to buy. The pricing page hides the form; this is the real check.
      if (account.proLifetime === true) return { ok: false, error: "lifetime" };

      const pageLocale = isLocale(locale) ? locale : isLocale(account.locale) ? account.locale : defaultLocale;

      // The row exists before Zarinpal answers, so a failed request is still in our history.
      const payment = await prisma.payment.create({
        data: { userId: account.id, plan: offer.id, amountToman: offer.amountToman, locale: pageLocale, status: "PENDING" },
      });

      try {
        const { authority } = await gateway.request({
          amountToman: offer.amountToman,
          description: gatewayDescription(pageLocale),
          callbackUrl: `${appUrl}/api/payments/callback`,
          metadata: { mobile: gatewayMobile(account.phoneNumber), email: gatewayEmail(account.email) },
        });
        await prisma.payment.update({ where: { id: payment.id }, data: { authority } });
        // A relative StartPay path (the e2e fake) becomes an absolute URL on this host.
        return { ok: true, url: new URL(gateway.startPayUrl(authority), appUrl).toString() };
      } catch (error) {
        if (error instanceof ZarinpalError) {
          await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", errorCode: error.code } });
          return { ok: false, error: "gateway" };
        }
        if (error instanceof ZarinpalUnavailable || error instanceof PaymentConfigError) {
          return { ok: false, error: "unavailable" };
        }
        throw error;
      }
    },

    async handleReturn({ authority, status }) {
      const payment = authority ? await prisma.payment.findUnique({ where: { authority } }) : null;
      if (!payment || !isPlanId(payment.plan)) return { outcome: "unknown", paymentId: null, locale: null };
      const done = (outcome: ReturnOutcome): ReturnResult => ({ outcome, paymentId: payment.id, locale: payment.locale });

      // A refresh of a finished payment must not verify again or flip it to cancelled.
      if (payment.status === "PAID") return done("success");

      if (status.toUpperCase() === "NOK") {
        // No verify code. The result page treats a failure with no errorCode as cancelled.
        await failUnlessPaid(payment.id, null);
        return done("cancelled");
      }

      try {
        const verdict = await verify({ id: payment.id, plan: payment.plan, amountToman: payment.amountToman, authority });
        if (verdict.kind === "failed") {
          await failUnlessPaid(payment.id, verdict.code);
          return done("failed");
        }
        return done(verdict.kind === "paid" ? "success" : "pending");
      } catch (error) {
        if (error instanceof PaymentConfigError) return done("pending");
        throw error;
      }
    },

    async reconcilePending({ olderThan }) {
      const rows = await prisma.payment.findMany({
        where: { status: "PENDING", createdAt: { lt: olderThan } },
        select: { id: true, plan: true, amountToman: true, authority: true },
        orderBy: { createdAt: "asc" },
      });
      const tally: ReconcileResult = { settled: 0, expired: 0, kept: 0 };
      for (const row of rows) {
        if (!row.authority || !isPlanId(row.plan)) {
          await expireIfPending(row.id, null);
          tally.expired += 1;
          continue;
        }
        const verdict = await verify({ id: row.id, plan: row.plan, amountToman: row.amountToman, authority: row.authority });
        if (verdict.kind === "paid") tally.settled += 1;
        else if (verdict.kind === "failed") {
          await expireIfPending(row.id, verdict.code);
          tally.expired += 1;
        } else tally.kept += 1;
      }
      return tally;
    },
  };
}

