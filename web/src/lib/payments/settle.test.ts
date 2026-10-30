import { describe, expect, it } from "vitest";
import type { ProColumns } from "./extend-pro";
import { YEAR_DAYS } from "./plans";
import { verifyAndGrant, verifyOutcome, type GrantLock } from "./settle";

const DAY = 86_400_000;
const NOW = new Date("2026-10-30T12:00:00Z");
const AUTHORITY = "A0000000000000000000000000000wwOGYpd";

type Memory = {
  status: "PENDING" | "PAID";
  user: ProColumns;
  refId: string | null;
  grants: number;
};

/** One grant at a time, same rule as the database row lock. */
function memoryLock(state: Memory): GrantLock {
  let tail = Promise.resolve();
  return {
    once(_paymentId, write) {
      const run = tail.then(() => {
        if (state.status === "PAID") return "already_paid" as const;
        const next = write(state.user);
        state.status = "PAID";
        state.user = next.user;
        state.refId = next.refId;
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
}

describe("verifyOutcome", () => {
  it("treats 100 and 101 as paid and the amount/session errors as final", () => {
    expect(verifyOutcome(100)).toBe("paid");
    expect(verifyOutcome(101)).toBe("paid");
    expect(verifyOutcome(-51)).toBe("definitive");
    expect(verifyOutcome(-50)).toBe("definitive");
    expect(verifyOutcome(-52)).toBe("transient");
    expect(verifyOutcome(-12)).toBe("transient");
  });
});

describe("verifyAndGrant", () => {
  const payment = {
    id: "pay-1",
    amountToman: 399000,
    authority: AUTHORITY,
    plan: "YEAR" as const,
  };

  it("calls verify twice and grants Pro once", async () => {
    let calls = 0;
    const gateway = {
      verify: async () => {
        calls += 1;
        return {
          code: calls === 1 ? 100 : 101,
          refId: "55",
          cardPan: "502229******5995",
        };
      },
    };
    const state: Memory = {
      status: "PENDING",
      user: { proUntil: null, proLifetime: false },
      refId: null,
      grants: 0,
    };
    const lock = memoryLock(state);

    const first = await verifyAndGrant({ gateway, lock, payment, now: NOW });
    const second = await verifyAndGrant({ gateway, lock, payment, now: NOW });

    expect(first).toEqual({ kind: "success" });
    expect(second).toEqual({ kind: "success" });
    expect(calls).toBe(2);
    expect(state.grants).toBe(1);
    expect(state.refId).toBe("55");
    expect(state.user.proLifetime).toBe(false);
    expect(state.user.proUntil?.toISOString()).toBe(new Date(NOW.getTime() + YEAR_DAYS * DAY).toISOString());
  });

  it("does not grant when two verifies say the payment was not made", async () => {
    let calls = 0;
    const gateway = {
      verify: async () => {
        calls += 1;
        return { code: -51, refId: null, cardPan: null };
      },
    };
    const state: Memory = {
      status: "PENDING",
      user: { proUntil: null, proLifetime: false },
      refId: null,
      grants: 0,
    };
    const outcome = await verifyAndGrant({ gateway, lock: memoryLock(state), payment, now: NOW });
    expect(outcome).toEqual({ kind: "failed", code: -51 });
    expect(calls).toBe(1);
    expect(state.grants).toBe(0);
    expect(state.user.proUntil).toBeNull();
  });
});
