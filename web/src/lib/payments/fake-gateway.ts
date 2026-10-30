// Stand-in for Zarinpal. Only used when the Playwright server sets E2E_OTP=1.
// The same process handles the request and the later verify, so the session lives on globalThis.

import { randomBytes } from "node:crypto";
import type { PaymentGateway, VerifyResult } from "./zarinpal";

type Session = {
  amountToman: number;
  refId: string;
  verified: boolean;
};

const KEY = "__pomodoroTestPay";

function sessions(): Map<string, Session> {
  const holder = globalThis as typeof globalThis & { [KEY]?: Map<string, Session> };
  holder[KEY] ??= new Map();
  return holder[KEY];
}

export function fakePayKnown(authority: string): boolean {
  return sessions().has(authority);
}

/** Remembers the amount. Verify returns 100 the first time and 101 after that. */
export function fakeGateway(): PaymentGateway {
  return {
    async request(input) {
      const authority = `E2E${randomBytes(12).toString("hex")}`;
      sessions().set(authority, {
        amountToman: input.amountToman,
        refId: String(100000 + sessions().size),
        verified: false,
      });
      return { authority };
    },

    async verify(input): Promise<VerifyResult> {
      const row = sessions().get(input.authority);
      if (!row) return { code: -54, refId: null, cardPan: null };
      if (row.amountToman !== input.amountToman) return { code: -50, refId: null, cardPan: null };
      const code = row.verified ? 101 : 100;
      row.verified = true;
      return { code, refId: row.refId, cardPan: "502229******5995" };
    },

    startPayUrl(authority) {
      return `/api/test/pay?authority=${authority}`;
    },
  };
}
