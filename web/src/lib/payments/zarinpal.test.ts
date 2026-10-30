import { afterEach, describe, expect, it } from "vitest";
import { PaymentConfigError, paymentEnv } from "./payment-env";
import { createZarinpal, ZarinpalError, ZarinpalUnavailable } from "./zarinpal";

const MERCHANT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const AUTHORITY = "A0000000000000000000000000000wwOGYpd";

type Call = { url: string; body: Record<string, unknown> };

function mockFetch(reply: (call: Call) => unknown, calls: Call[] = []): typeof fetch {
  return (async (input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const call = { url: String(input), body };
    calls.push(call);
    return Response.json(reply(call));
  }) as typeof fetch;
}

describe("createZarinpal", () => {
  it("requests in toman on the sandbox host and redirects to sandbox StartPay", async () => {
    const calls: Call[] = [];
    const gateway = createZarinpal({
      merchantId: MERCHANT,
      sandbox: true,
      fetch: mockFetch(
        () => ({ data: { code: 100, authority: AUTHORITY }, errors: [] }),
        calls,
      ),
    });

    const result = await gateway.request({
      amountToman: 10000,
      description: "Pro",
      callbackUrl: "http://localhost:3000/api/payments/callback",
      metadata: { mobile: "09121234567" },
    });

    expect(result.authority).toBe(AUTHORITY);
    expect(calls[0]?.url).toBe("https://sandbox.zarinpal.com/pg/v4/payment/request.json");
    expect(calls[0]?.body).toEqual({
      merchant_id: MERCHANT,
      amount: 10000,
      currency: "IRT",
      description: "Pro",
      callback_url: "http://localhost:3000/api/payments/callback",
      metadata: { mobile: "09121234567" },
    });
    expect(gateway.startPayUrl(AUTHORITY)).toBe(
      `https://sandbox.zarinpal.com/pg/StartPay/${AUTHORITY}`,
    );
  });

  it("verifies the same toman amount, with no currency field, on the production host", async () => {
    const calls: Call[] = [];
    const gateway = createZarinpal({
      merchantId: MERCHANT,
      sandbox: false,
      fetch: mockFetch(
        () => ({
          data: { code: 100, ref_id: 201, card_pan: "502229******5995" },
          errors: [],
        }),
        calls,
      ),
    });

    const result = await gateway.verify({ amountToman: 399000, authority: AUTHORITY });

    expect(result).toEqual({ code: 100, refId: "201", cardPan: "502229******5995" });
    expect(calls[0]?.url).toBe("https://payment.zarinpal.com/pg/v4/payment/verify.json");
    expect(calls[0]?.body).toEqual({
      merchant_id: MERCHANT,
      amount: 399000,
      authority: AUTHORITY,
    });
    expect(calls[0]?.body).not.toHaveProperty("currency");
    expect(gateway.startPayUrl(AUTHORITY)).toBe(
      `https://payment.zarinpal.com/pg/StartPay/${AUTHORITY}`,
    );
  });

  it("returns code 101 without treating it as a new request failure", async () => {
    const gateway = createZarinpal({
      merchantId: MERCHANT,
      sandbox: true,
      fetch: mockFetch(() => ({ data: { code: 101, ref_id: 201, card_pan: "502229******5995" }, errors: [] })),
    });
    const result = await gateway.verify({ amountToman: 1000, authority: AUTHORITY });
    expect(result.code).toBe(101);
    expect(result.refId).toBe("201");
  });

  it("surfaces a verify error code from the errors object", async () => {
    const gateway = createZarinpal({
      merchantId: MERCHANT,
      sandbox: true,
      fetch: mockFetch(() => ({ data: [], errors: { code: -51, message: "Session is not valid" } })),
    });
    const result = await gateway.verify({ amountToman: 1000, authority: AUTHORITY });
    expect(result.code).toBe(-51);
    expect(result.refId).toBeNull();
  });

  it("throws the request error code and does not invent an authority", async () => {
    const gateway = createZarinpal({
      merchantId: MERCHANT,
      sandbox: true,
      fetch: mockFetch(() => ({ data: [], errors: { code: -9, message: "Validation error" } })),
    });
    await expect(
      gateway.request({
        amountToman: 1000,
        description: "Pro",
        callbackUrl: "http://localhost:3000/api/payments/callback",
        metadata: {},
      }),
    ).rejects.toMatchObject({ name: "ZarinpalError", code: -9 });
  });

  it("treats a network failure as unavailable", async () => {
    const gateway = createZarinpal({
      merchantId: MERCHANT,
      sandbox: true,
      fetch: (async () => {
        throw new Error("offline");
      }) as typeof fetch,
    });
    await expect(gateway.verify({ amountToman: 1000, authority: AUTHORITY })).rejects.toBeInstanceOf(
      ZarinpalUnavailable,
    );
  });

  it("refuses an amount that is not a whole number of toman", async () => {
    const gateway = createZarinpal({ merchantId: MERCHANT, sandbox: true, fetch: mockFetch(() => ({})) });
    await expect(gateway.verify({ amountToman: 10.5, authority: AUTHORITY })).rejects.toBeInstanceOf(ZarinpalError);
  });
});

describe("paymentEnv", () => {
  const keys = ["ZARINPAL_MERCHANT_ID", "ZARINPAL_SANDBOX", "APP_URL"] as const;
  const previous = new Map<string, string | undefined>();

  afterEach(() => {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    previous.clear();
  });

  function set(values: Partial<Record<(typeof keys)[number], string | undefined>>) {
    for (const key of keys) {
      if (!previous.has(key)) previous.set(key, process.env[key]);
      const value = values[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  it("reads the merchant, the sandbox flag and the app url", () => {
    set({
      ZARINPAL_MERCHANT_ID: MERCHANT,
      ZARINPAL_SANDBOX: "false",
      APP_URL: "http://localhost:3000/",
    });
    expect(paymentEnv()).toEqual({
      merchantId: MERCHANT,
      sandbox: false,
      appUrl: "http://localhost:3000",
    });
  });

  it("defaults a missing sandbox flag to sandbox", () => {
    set({ ZARINPAL_MERCHANT_ID: MERCHANT, APP_URL: "http://localhost:3000" });
    expect(paymentEnv().sandbox).toBe(true);
  });

  it("fails closed when the merchant id is missing, without echoing env values", () => {
    set({ APP_URL: "http://localhost:3000", ZARINPAL_SANDBOX: "true" });
    expect(() => paymentEnv()).toThrow(PaymentConfigError);
    try {
      paymentEnv();
    } catch (error) {
      expect(String(error)).not.toContain("localhost");
    }
  });
});
