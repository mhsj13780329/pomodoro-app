import { cookies } from "next/headers";
import { z } from "zod";
import { LOCALE_COOKIE } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/current-user";
import { createCheckout } from "@/lib/payments/checkout";
import { PaymentConfigError } from "@/lib/payments/payment-env";
import { paymentSetup } from "@/lib/payments/payment-setup";
import { readJson } from "@/lib/sync/http";

// The browser sends a plan id only. The toman amount is copied from plans.ts inside
// beginCheckout, so a modified request cannot pick its own price.

const bodySchema = z.object({
  plan: z.enum(["MONTH", "YEAR", "LIFETIME"]),
});

const STATUS = { unauthorized: 401, lifetime: 409, invalid_plan: 400, gateway: 502, unavailable: 503 } as const;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const json = await readJson(request);
  if (json instanceof Response) return json;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  let setup;
  try {
    setup = paymentSetup(new URL(request.url).origin);
  } catch (error) {
    if (error instanceof PaymentConfigError) return Response.json({ error: "unavailable" }, { status: 503 });
    throw error;
  }

  const result = await createCheckout({ gateway: setup.gateway }).beginCheckout({
    userId: user.id,
    planId: parsed.data.plan,
    locale: (await cookies()).get(LOCALE_COOKIE)?.value,
    appUrl: setup.appUrl,
  });
  if (result.ok) return Response.json({ url: result.url });
  // The wire name for a bad plan stays "invalid", as before.
  const error = result.error === "invalid_plan" ? "invalid" : result.error;
  return Response.json({ error }, { status: STATUS[result.error] });
}
