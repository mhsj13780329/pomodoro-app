import { afterEach, describe, expect, it } from "vitest";
import { fakeGateway } from "./fake-gateway";
import { PaymentConfigError } from "./payment-env";
import { getPaymentGateway } from "./zarinpal";

describe("fakeGateway", () => {
  it("verifies once as 100 and the second time as 101", async () => {
    const gateway = fakeGateway();
    const { authority } = await gateway.request({
      amountToman: 399000,
      description: "Pro",
      callbackUrl: "http://localhost/api/payments/callback",
      metadata: {},
    });
    expect(gateway.startPayUrl(authority)).toBe(`/api/test/pay?authority=${authority}`);

    const first = await gateway.verify({ amountToman: 399000, authority });
    const second = await gateway.verify({ amountToman: 399000, authority });
    expect(first.code).toBe(100);
    expect(second.code).toBe(101);
    expect(second.refId).toBe(first.refId);
  });
});

describe("getPaymentGateway", () => {
  const previous = process.env.E2E_OTP;

  afterEach(() => {
    if (previous === undefined) delete process.env.E2E_OTP;
    else process.env.E2E_OTP = previous;
  });

  it("does not open the fake gateway unless the e2e flag is on", () => {
    delete process.env.E2E_OTP;
    expect(() => getPaymentGateway()).toThrow(PaymentConfigError);
  });

  it("uses the fake gateway when E2E_OTP=1", async () => {
    process.env.E2E_OTP = "1";
    const gateway = getPaymentGateway();
    const { authority } = await gateway.request({
      amountToman: 49000,
      description: "Pro",
      callbackUrl: "http://localhost/cb",
      metadata: {},
    });
    expect(authority.startsWith("E2E")).toBe(true);
    expect(gateway.startPayUrl(authority)).toContain("/api/test/pay?authority=");
  });
});
