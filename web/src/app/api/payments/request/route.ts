import { cookies } from "next/headers";
import { z } from "zod";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/current-user";
import { paymentEnv, PaymentConfigError } from "@/lib/payments/payment-env";
import { gatewayEmail, gatewayMobile } from "@/lib/payments/buyer";
import { gatewayDescription } from "@/lib/payments/description";
import { getPlan } from "@/lib/payments/plans";
import { getPaymentGateway, ZarinpalError, ZarinpalUnavailable } from "@/lib/payments/zarinpal";
import { prisma } from "@/lib/prisma";
import { readJson } from "@/lib/sync/http";
import { testOtpEnabled } from "@/lib/test-otp";

// The browser sends a plan id only. The toman amount is copied from plans.ts here,
// so a modified request cannot pick its own price.

const bodySchema = z.object({
  plan: z.enum(["MONTH", "YEAR", "LIFETIME"]),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const json = await readJson(request);
  if (json instanceof Response) return json;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  const offer = getPlan(parsed.data.plan);
  if (!offer) return Response.json({ error: "invalid" }, { status: 400 });

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, phoneNumber: true, locale: true, proLifetime: true },
  });
  if (!account) return Response.json({ error: "unauthorized" }, { status: 401 });
  // A lifetime account has nothing left to buy. The pricing page hides the form; this is the real check.
  if (account.proLifetime === true) return Response.json({ error: "lifetime" }, { status: 409 });

  let gateway;
  let appUrl: string;
  try {
    gateway = getPaymentGateway();
    // The e2e server has no merchant id. Its callback is this server's own origin.
    appUrl = testOtpEnabled() ? new URL(request.url).origin : paymentEnv().appUrl;
  } catch (error) {
    if (error instanceof PaymentConfigError) return Response.json({ error: "unavailable" }, { status: 503 });
    throw error;
  }

  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : isLocale(account.locale) ? account.locale : defaultLocale;

  // The row exists before Zarinpal answers, so a failed request is still in our history.
  const payment = await prisma.payment.create({
    data: {
      userId: account.id,
      plan: offer.id,
      amountToman: offer.amountToman,
      locale,
      status: "PENDING",
    },
  });

  try {
    const { authority } = await gateway.request({
      amountToman: offer.amountToman,
      description: gatewayDescription(locale),
      callbackUrl: `${appUrl}/api/payments/callback`,
      metadata: {
        mobile: gatewayMobile(account.phoneNumber),
        email: gatewayEmail(account.email),
      },
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { authority } });
    // A relative StartPay path (the e2e fake) becomes an absolute URL on this host.
    const start = gateway.startPayUrl(authority);
    return Response.json({ url: new URL(start, appUrl).toString() });
  } catch (error) {
    if (error instanceof ZarinpalError) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", errorCode: error.code },
      });
      return Response.json({ error: "gateway" }, { status: 502 });
    }
    if (error instanceof ZarinpalUnavailable || error instanceof PaymentConfigError) {
      return Response.json({ error: "unavailable" }, { status: 503 });
    }
    throw error;
  }
}
