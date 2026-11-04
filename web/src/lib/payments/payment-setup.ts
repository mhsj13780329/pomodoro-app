// How a request or the reconcile script chooses its gateway and callback origin.
// The Playwright server (E2E_OTP=1) gets the in-memory gateway and its own origin;
// everything else gets Zarinpal and APP_URL.

import { testOtpEnabled } from "@/lib/test-otp";
import { paymentEnv } from "./payment-env";
import { getPaymentGateway, type PaymentGateway } from "./zarinpal";

/** Throws PaymentConfigError when the live settings are missing. `origin` is this server's own. */
export function paymentSetup(origin: string): { gateway: PaymentGateway; appUrl: string } {
  const gateway = getPaymentGateway();
  // The e2e server has no merchant id. Its callback is this server's own origin.
  return { gateway, appUrl: testOtpEnabled() ? origin : paymentEnv().appUrl };
}

/**
 * Builds the real gateway on first use, so a request that never needs it (an unknown
 * authority, a cancellation) does not fail on missing settings. Throws PaymentConfigError on use.
 */
export function lazyGateway(): PaymentGateway {
  let inner: PaymentGateway | undefined;
  const get = () => (inner ??= getPaymentGateway());
  return {
    request: (input) => get().request(input),
    verify: (input) => get().verify(input),
    startPayUrl: (authority) => get().startPayUrl(authority),
  };
}
