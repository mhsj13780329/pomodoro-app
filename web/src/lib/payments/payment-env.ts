import { z } from "zod";

// Read only when a payment actually runs. env.ts is loaded at startup by auth,
// and a missing merchant id must not stop the timer.

const schema = z.object({
  ZARINPAL_MERCHANT_ID: z.string().length(36),
  ZARINPAL_SANDBOX: z.enum(["true", "false"]),
  APP_URL: z.url(),
});

export type PaymentEnv = {
  merchantId: string;
  sandbox: boolean;
  /** No trailing slash, so routes can append a path. */
  appUrl: string;
};

export class PaymentConfigError extends Error {
  constructor() {
    super("Payment is not configured");
    this.name = "PaymentConfigError";
  }
}

/** Throws PaymentConfigError when .env.local is missing a payment setting. Never includes the secret. */
export function paymentEnv(): PaymentEnv {
  const parsed = schema.safeParse({
    ZARINPAL_MERCHANT_ID: process.env.ZARINPAL_MERCHANT_ID,
    // Missing means sandbox, so a forgotten flag cannot charge the live gateway.
    ZARINPAL_SANDBOX: process.env.ZARINPAL_SANDBOX ?? "true",
    APP_URL: process.env.APP_URL,
  });
  if (!parsed.success) throw new PaymentConfigError();
  return {
    merchantId: parsed.data.ZARINPAL_MERCHANT_ID,
    sandbox: parsed.data.ZARINPAL_SANDBOX === "true",
    appUrl: parsed.data.APP_URL.replace(/\/$/, ""),
  };
}
