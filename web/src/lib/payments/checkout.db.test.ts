// Runs against the real test database (npm run test:db). Only the gateway is faked.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MONTH_DAYS, YEAR_DAYS } from "./plans";
import { ZarinpalError, ZarinpalUnavailable, type PaymentGateway, type VerifyResult } from "./zarinpal";

const DAY = 86_400_000;
const NOW = new Date("2026-10-30T12:00:00Z");
const APP_URL = "https://app.example.test";

type Prisma = typeof import("@/lib/prisma").prisma;
type CreateCheckout = typeof import("./checkout").createCheckout;

let prisma: Prisma;
let createCheckout: CreateCheckout;

beforeAll(async () => {
  // env.ts validates these at import, so they are set before the dynamic import.
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-1234");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  ({ prisma } = await import("@/lib/prisma"));
  ({ createCheckout } = await import("./checkout"));
});

const userIds: string[] = [];

afterEach(async () => {
  await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } }); // payments cascade
});

afterAll(async () => {
  await prisma.$disconnect();
  vi.unstubAllEnvs();
});

async function makeUser(data: { proUntil?: Date | null; proLifetime?: boolean } = {}) {
  const id = `pay-test-${randomUUID()}`;
  userIds.push(id);
  return prisma.user.create({
    data: { id, name: "Tester", email: `${id}@example.com`, ...data },
  });
}

async function makePayment(
  userId: string,
  data: { plan?: "MONTH" | "YEAR" | "LIFETIME"; authority?: string | null; createdAt?: Date; status?: "PENDING" | "PAID" } = {},
) {
  return prisma.payment.create({
    data: {
      userId,
      plan: data.plan ?? "MONTH",
      amountToman: 49_000,
      authority: data.authority === undefined ? `A${randomUUID()}` : data.authority,
      locale: "en",
      status: data.status ?? "PENDING",
      createdAt: data.createdAt,
    },
  });
}

const paidResult = (code = 100): VerifyResult => ({ code, refId: "55", cardPan: "502229******5995" });
const codeResult = (code: number): VerifyResult => ({ code, refId: null, cardPan: null });

/** Answers requests with a fresh authority and verifies through `verify`. */
function scripted(verify: PaymentGateway["verify"], request?: PaymentGateway["request"]): PaymentGateway {
  return {
    request: request ?? (async () => ({ authority: `A${randomUUID()}` })),
    verify,
    startPayUrl: (authority) => `https://pay.example.test/${authority}`,
  };
}

/** First verify per authority is 100, later ones 101, like Zarinpal. */
function realisticGateway(): PaymentGateway & { calls: number } {
  const seen = new Set<string>();
  const gateway = scripted(async ({ authority }) => {
    gateway.calls += 1;
    const again = seen.has(authority);
    seen.add(authority);
    return paidResult(again ? 101 : 100);
  }) as PaymentGateway & { calls: number };
  gateway.calls = 0;
  return gateway;
}

const reload = (id: string) => prisma.payment.findUniqueOrThrow({ where: { id } });
const proOf = (id: string) => prisma.user.findUniqueOrThrow({ where: { id }, select: { proUntil: true, proLifetime: true } });

describe("beginCheckout", () => {
  it("creates a PENDING row with the plan's amount and stores the authority", async () => {
    const user = await makeUser();
    const checkout = createCheckout({ gateway: scripted(async () => paidResult()) });
    const result = await checkout.beginCheckout({ userId: user.id, planId: "YEAR", locale: "en", appUrl: APP_URL });
    expect(result.ok).toBe(true);
    const row = await prisma.payment.findFirstOrThrow({ where: { userId: user.id } });
    expect(row).toMatchObject({ status: "PENDING", plan: "YEAR", amountToman: 399_000, locale: "en" });
    expect(row.authority).toMatch(/^A/);
    expect(result.ok && result.url).toBe(`https://pay.example.test/${row.authority}`);
  });

  it("leaves the row FAILED with the code when the gateway refuses", async () => {
    const user = await makeUser();
    const gateway = scripted(
      async () => paidResult(),
      async () => {
        throw new ZarinpalError(-9);
      },
    );
    const result = await createCheckout({ gateway }).beginCheckout({
      userId: user.id,
      planId: "MONTH",
      appUrl: APP_URL,
    });
    expect(result).toEqual({ ok: false, error: "gateway" });
    const row = await prisma.payment.findFirstOrThrow({ where: { userId: user.id } });
    expect(row).toMatchObject({ status: "FAILED", errorCode: -9, authority: null });
  });

  it("reports unavailable and keeps the row PENDING when the gateway cannot be reached", async () => {
    const user = await makeUser();
    const gateway = scripted(
      async () => paidResult(),
      async () => {
        throw new ZarinpalUnavailable();
      },
    );
    const result = await createCheckout({ gateway }).beginCheckout({ userId: user.id, planId: "MONTH", appUrl: APP_URL });
    expect(result).toEqual({ ok: false, error: "unavailable" });
    expect((await prisma.payment.findFirstOrThrow({ where: { userId: user.id } })).status).toBe("PENDING");
  });

  it("refuses a lifetime account and creates nothing", async () => {
    const user = await makeUser({ proLifetime: true });
    const result = await createCheckout({ gateway: realisticGateway() }).beginCheckout({
      userId: user.id,
      planId: "MONTH",
      appUrl: APP_URL,
    });
    expect(result).toEqual({ ok: false, error: "lifetime" });
    expect(await prisma.payment.count({ where: { userId: user.id } })).toBe(0);
  });

  it("refuses an unknown plan and an unknown user", async () => {
    const user = await makeUser();
    const checkout = createCheckout({ gateway: realisticGateway() });
    expect(await checkout.beginCheckout({ userId: user.id, planId: "WEEK", appUrl: APP_URL })).toEqual({
      ok: false,
      error: "invalid_plan",
    });
    expect(await checkout.beginCheckout({ userId: "nobody", planId: "MONTH", appUrl: APP_URL })).toEqual({
      ok: false,
      error: "unauthorized",
    });
  });
});

describe("with the fake gateway", () => {
  it("runs begin, return, return end to end and grants once", async () => {
    const { fakeGateway } = await import("./fake-gateway");
    const user = await makeUser();
    const checkout = createCheckout({ gateway: fakeGateway(), now: () => NOW });
    const begun = await checkout.beginCheckout({ userId: user.id, planId: "MONTH", appUrl: APP_URL });
    expect(begun.ok && begun.url).toContain(`${APP_URL}/api/test/pay?authority=E2E`);
    const row = await prisma.payment.findFirstOrThrow({ where: { userId: user.id } });
    await checkout.handleReturn({ authority: row.authority!, status: "OK" });
    await checkout.handleReturn({ authority: row.authority!, status: "OK" });
    expect((await proOf(user.id)).proUntil).toEqual(new Date(NOW.getTime() + MONTH_DAYS * DAY));
  });
});

describe("handleReturn", () => {
  it("treats NOK as cancelled and leaves FAILED with no code", async () => {
    const user = await makeUser();
    const payment = await makePayment(user.id);
    const checkout = createCheckout({ gateway: realisticGateway() });
    const result = await checkout.handleReturn({ authority: payment.authority!, status: "NOK" });
    expect(result).toEqual({ outcome: "cancelled", paymentId: payment.id, locale: "en" });
    expect(await reload(payment.id)).toMatchObject({ status: "FAILED", errorCode: null });
    expect((await proOf(user.id)).proUntil).toBeNull();
  });

  it("grants Pro once; a second return (101) does not add the days again", async () => {
    const user = await makeUser();
    const payment = await makePayment(user.id, { plan: "YEAR" });
    const gateway = realisticGateway();
    const checkout = createCheckout({ gateway, now: () => NOW });
    const first = await checkout.handleReturn({ authority: payment.authority!, status: "OK" });
    expect(first.outcome).toBe("success");
    const expected = new Date(NOW.getTime() + YEAR_DAYS * DAY);
    expect((await proOf(user.id)).proUntil).toEqual(expected);
    expect(await reload(payment.id)).toMatchObject({ status: "PAID", refId: "55", cardPan: "502229******5995" });

    // Even if the PAID short-circuit were missed, code 101 must not add days: force a second verify.
    const second = await createCheckout({ gateway, now: () => new Date(NOW.getTime() + DAY) }).handleReturn({
      authority: payment.authority!,
      status: "OK",
    });
    expect(second.outcome).toBe("success");
    expect((await proOf(user.id)).proUntil).toEqual(expected);
  });

  it("does not add the days again when the gateway answers 101 for a still-PENDING row race", async () => {
    // Both returns pass the PENDING check, then both verify; the lock lets one grant.
    const user = await makeUser();
    const payment = await makePayment(user.id, { plan: "MONTH" });
    const checkout = createCheckout({ gateway: realisticGateway(), now: () => NOW });
    const [a, b] = await Promise.all([
      checkout.handleReturn({ authority: payment.authority!, status: "OK" }),
      checkout.handleReturn({ authority: payment.authority!, status: "OK" }),
    ]);
    expect([a.outcome, b.outcome]).toEqual(["success", "success"]);
    expect((await proOf(user.id)).proUntil).toEqual(new Date(NOW.getTime() + MONTH_DAYS * DAY));
  });

  it("stacks two different payments for one user settled concurrently", async () => {
    const user = await makeUser();
    const year = await makePayment(user.id, { plan: "YEAR" });
    const month = await makePayment(user.id, { plan: "MONTH" });
    const checkout = createCheckout({ gateway: realisticGateway(), now: () => NOW });
    await Promise.all([
      checkout.handleReturn({ authority: year.authority!, status: "OK" }),
      checkout.handleReturn({ authority: month.authority!, status: "OK" }),
    ]);
    expect((await proOf(user.id)).proUntil).toEqual(new Date(NOW.getTime() + (YEAR_DAYS + MONTH_DAYS) * DAY));
    expect((await reload(year.id)).status).toBe("PAID");
    expect((await reload(month.id)).status).toBe("PAID");
  });

  it("sets proLifetime for a lifetime plan", async () => {
    const user = await makeUser();
    const payment = await makePayment(user.id, { plan: "LIFETIME" });
    await createCheckout({ gateway: realisticGateway(), now: () => NOW }).handleReturn({
      authority: payment.authority!,
      status: "OK",
    });
    expect((await proOf(user.id)).proLifetime).toBe(true);
  });

  it.each([-50, -51, -53, -54, -55])("treats definitive code %i as failed and stores it", async (code) => {
    const user = await makeUser();
    const payment = await makePayment(user.id);
    const checkout = createCheckout({ gateway: scripted(async () => codeResult(code)) });
    const result = await checkout.handleReturn({ authority: payment.authority!, status: "OK" });
    expect(result.outcome).toBe("failed");
    expect(await reload(payment.id)).toMatchObject({ status: "FAILED", errorCode: code });
    expect((await proOf(user.id)).proUntil).toBeNull();
  });

  it.each([
    ["unreachable", async (): Promise<VerifyResult> => { throw new ZarinpalUnavailable(); }],
    ["-52", async () => codeResult(-52)],
    ["-12", async () => codeResult(-12)],
  ])("stays pending when Zarinpal is %s", async (_name, verify) => {
    const user = await makeUser();
    const payment = await makePayment(user.id);
    const result = await createCheckout({ gateway: scripted(verify) }).handleReturn({
      authority: payment.authority!,
      status: "OK",
    });
    expect(result.outcome).toBe("pending");
    expect((await reload(payment.id)).status).toBe("PENDING");
  });

  it("does not let a late FAILED overwrite a PAID row", async () => {
    const user = await makeUser();
    const payment = await makePayment(user.id);
    // The first verify is held back and then says "failed"; the second says paid right away.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let call = 0;
    const gateway = scripted(async () => {
      call += 1;
      if (call === 1) {
        await held;
        return codeResult(-51);
      }
      return paidResult();
    });
    const checkout = createCheckout({ gateway, now: () => NOW });
    const slow = checkout.handleReturn({ authority: payment.authority!, status: "OK" });
    await vi.waitFor(() => expect(call).toBe(1));
    expect((await checkout.handleReturn({ authority: payment.authority!, status: "OK" })).outcome).toBe("success");
    release();
    expect((await slow).outcome).toBe("failed");
    expect(await reload(payment.id)).toMatchObject({ status: "PAID", errorCode: null });
    expect((await proOf(user.id)).proUntil).not.toBeNull();
  });

  it("does not cancel a PAID row on a later NOK", async () => {
    const user = await makeUser();
    const payment = await makePayment(user.id, { status: "PAID" });
    const result = await createCheckout({ gateway: realisticGateway() }).handleReturn({
      authority: payment.authority!,
      status: "NOK",
    });
    expect(result.outcome).toBe("success");
    expect((await reload(payment.id)).status).toBe("PAID");
  });

  it("answers unknown for an authority it never issued", async () => {
    const checkout = createCheckout({ gateway: realisticGateway() });
    expect(await checkout.handleReturn({ authority: "Anope", status: "OK" })).toEqual({
      outcome: "unknown",
      paymentId: null,
      locale: null,
    });
    expect((await checkout.handleReturn({ authority: "", status: "OK" })).outcome).toBe("unknown");
  });
});

describe("reconcilePending", () => {
  const OLD = new Date(Date.now() - 60 * 60 * 1000);
  const CUTOFF = new Date(Date.now() - 15 * 60 * 1000);

  it("settles, expires, keeps and ignores the right rows, and is idempotent", async () => {
    const user = await makeUser();
    const paid = await makePayment(user.id, { createdAt: OLD, plan: "MONTH" });
    const dead = await makePayment(user.id, { createdAt: OLD });
    const noAuthority = await makePayment(user.id, { createdAt: OLD, authority: null });
    const flaky = await makePayment(user.id, { createdAt: OLD });
    const down = await makePayment(user.id, { createdAt: OLD });
    const fresh = await makePayment(user.id);

    const answers = new Map<string, () => Promise<VerifyResult>>([
      [paid.authority!, async () => paidResult()],
      [dead.authority!, async () => codeResult(-54)],
      [flaky.authority!, async () => codeResult(-52)],
      [
        down.authority!,
        async () => {
          throw new ZarinpalUnavailable();
        },
      ],
    ]);
    const gateway = scripted(async ({ authority }) => {
      const answer = answers.get(authority);
      if (!answer) throw new Error(`unexpected verify for ${authority}`);
      return answer();
    });
    const checkout = createCheckout({ gateway, now: () => NOW });

    expect(await checkout.reconcilePending({ olderThan: CUTOFF })).toEqual({ settled: 1, expired: 2, kept: 2 });
    expect(await reload(paid.id)).toMatchObject({ status: "PAID" });
    expect(await reload(dead.id)).toMatchObject({ status: "EXPIRED", errorCode: -54 });
    expect(await reload(noAuthority.id)).toMatchObject({ status: "EXPIRED", errorCode: null });
    expect((await reload(flaky.id)).status).toBe("PENDING");
    expect((await reload(down.id)).status).toBe("PENDING");
    expect((await reload(fresh.id)).status).toBe("PENDING");
    const proUntil = (await proOf(user.id)).proUntil;
    expect(proUntil).toEqual(new Date(NOW.getTime() + MONTH_DAYS * DAY));

    // Second run: only the two kept rows are looked at again; nothing is granted twice.
    expect(await checkout.reconcilePending({ olderThan: CUTOFF })).toEqual({ settled: 0, expired: 0, kept: 2 });
    expect((await proOf(user.id)).proUntil).toEqual(proUntil);
  });

  it("does not touch rows that are not PENDING", async () => {
    const user = await makeUser();
    const paid = await makePayment(user.id, { createdAt: OLD, status: "PAID" });
    const checkout = createCheckout({ gateway: scripted(async () => codeResult(-51)) });
    expect(await checkout.reconcilePending({ olderThan: CUTOFF })).toEqual({ settled: 0, expired: 0, kept: 0 });
    expect((await reload(paid.id)).status).toBe("PAID");
  });
});
