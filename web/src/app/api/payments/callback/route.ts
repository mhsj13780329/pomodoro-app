import { connection, NextResponse } from "next/server";
import { defaultLocale, isLocale } from "@/i18n/routing";
import { markPaymentFailed, prismaGrantLock } from "@/lib/payments/grant-db";
import { isPlanId } from "@/lib/payments/plans";
import { verifyAndGrant } from "@/lib/payments/settle";
import { getPaymentGateway, ZarinpalUnavailable } from "@/lib/payments/zarinpal";
import { PaymentConfigError } from "@/lib/payments/payment-env";
import { prisma } from "@/lib/prisma";

type Outcome = "success" | "failed" | "cancelled" | "pending" | "unknown";

function resultLocation(locale: string, paymentId: string | null, outcome: Outcome): URL {
  const safe = isLocale(locale) ? locale : defaultLocale;
  const url = new URL(`/${safe}/pricing/result`, "http://localhost");
  url.searchParams.set("outcome", outcome);
  if (paymentId) url.searchParams.set("payment", paymentId);
  return url;
}

function redirectTo(request: Request, locale: string, paymentId: string | null, outcome: Outcome) {
  const path = resultLocation(locale, paymentId, outcome);
  // Same host the buyer is already on. The query is a hint; the result page reads the row.
  return NextResponse.redirect(new URL(`${path.pathname}${path.search}`, request.url), 303);
}

/**
 * Zarinpal sends the buyer's browser here. It does not call us itself.
 * Status=NOK means they cancelled or the bank refused, so we do not verify.
 * Any other status is untrusted: we verify with the amount stored on our row.
 */
export async function GET(request: Request) {
  // A cached GET would skip verify, or replay an old redirect.
  await connection();

  const query = new URL(request.url).searchParams;
  const authority = query.get("Authority") ?? query.get("authority") ?? "";
  const status = (query.get("Status") ?? query.get("status") ?? "").toUpperCase();

  const payment = authority
    ? await prisma.payment.findUnique({ where: { authority } })
    : null;
  if (!payment || !isPlanId(payment.plan)) {
    return redirectTo(request, defaultLocale, null, "unknown");
  }

  // A refresh of a finished payment must not verify again or flip it to cancelled.
  if (payment.status === "PAID") {
    return redirectTo(request, payment.locale, payment.id, "success");
  }

  if (status === "NOK") {
    // No verify code. The result page treats a failure with no errorCode as cancelled.
    await markPaymentFailed(payment.id, null);
    return redirectTo(request, payment.locale, payment.id, "cancelled");
  }

  let gateway;
  try {
    gateway = getPaymentGateway();
  } catch (error) {
    if (error instanceof PaymentConfigError) return redirectTo(request, payment.locale, payment.id, "pending");
    throw error;
  }

  try {
    const outcome = await verifyAndGrant({
      gateway,
      lock: prismaGrantLock(),
      payment: {
        id: payment.id,
        amountToman: payment.amountToman,
        authority,
        plan: payment.plan,
      },
      now: new Date(),
    });
    if (outcome.kind === "failed") {
      await markPaymentFailed(payment.id, outcome.code);
      return redirectTo(request, payment.locale, payment.id, "failed");
    }
    if (outcome.kind === "pending") return redirectTo(request, payment.locale, payment.id, "pending");
    return redirectTo(request, payment.locale, payment.id, "success");
  } catch (error) {
    if (error instanceof ZarinpalUnavailable) return redirectTo(request, payment.locale, payment.id, "pending");
    throw error;
  }
}
