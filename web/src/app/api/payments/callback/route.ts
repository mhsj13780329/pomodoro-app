import { connection, NextResponse } from "next/server";
import { defaultLocale, isLocale } from "@/i18n/routing";
import { createCheckout } from "@/lib/payments/checkout";
import { lazyGateway } from "@/lib/payments/payment-setup";

/**
 * Zarinpal sends the buyer's browser here. It does not call us itself.
 * Status=NOK means they cancelled or the bank refused, so we do not verify.
 * Any other status is untrusted: handleReturn verifies with the amount stored on our row.
 */
export async function GET(request: Request) {
  // A cached GET would skip verify, or replay an old redirect.
  await connection();

  const query = new URL(request.url).searchParams;
  const authority = query.get("Authority") ?? query.get("authority") ?? "";
  const status = query.get("Status") ?? query.get("status") ?? "";

  const { outcome, paymentId, locale } = await createCheckout({ gateway: lazyGateway() }).handleReturn({
    authority,
    status,
  });

  // Same host the buyer is already on. The query is a hint; the result page reads the row.
  const safe = locale && isLocale(locale) ? locale : defaultLocale;
  const target = new URL(`/${safe}/pricing/result`, request.url);
  target.searchParams.set("outcome", outcome);
  if (paymentId) target.searchParams.set("payment", paymentId);
  return NextResponse.redirect(target, 303);
}
