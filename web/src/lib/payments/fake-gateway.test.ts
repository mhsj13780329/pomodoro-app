import { afterEach, describe, expect, it } from "vitest";
import { fakeGateway } from "./fake-gateway";
import { PaymentConfigError } from "./payment-env";
import { verifyAndGrant, type GrantLock } from "./settle";
import type { ProColumns } from "./extend-pro";
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

  it("grants through settle only once when verify is called twice", async () => {
    const gateway = fakeGateway();
    const { authority } = await gateway.request({
      amountToman: 399000,
      description: "Pro",
      callbackUrl: "http://localhost/api/payments/callback",
      metadata: {},
    });
    const state: { status: "PENDING" | "PAID"; user: ProColumns; grants: number } = {
      status: "PENDING",
      user: { proUntil: null, proLifetime: false },
      grants: 0,
    };
    let tail = Promise.resolve();
    const lock: GrantLock = {
      once(_id, write) {
        const run = tail.then(() => {
          if (state.status === "PAID") return "already_paid" as const;
          state.user = write(state.user).user;
          state.status = "PAID";
          state.grants += 1;
          return "granted" as const;
        });
        tail = run.then(
          () => undefined,
          () => undefined,
        );
        return run;
      },
    };
    const payment = { id: "p", amountToman: 399000, authority, plan: "YEAR" as const };
    const now = new Date("2026-10-30T12:00:00Z");
    await verifyAndGrant({ gateway, lock, payment, now });
    await verifyAndGrant({ gateway, lock, payment, now });
    expect(state.grants).toBe(1);
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
