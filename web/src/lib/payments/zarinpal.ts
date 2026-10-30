// The only module that knows Zarinpal's hosts. Callers pass an amount and an authority;
// they never build a request, verify, or StartPay URL themselves.
//
// Amounts are toman. currency "IRT" tells Zarinpal that. Verify has no currency field:
// it must be sent the same integer, or Zarinpal answers -50 (amount mismatch).

import { paymentEnv } from "./payment-env";

const PRODUCTION = {
  request: "https://payment.zarinpal.com/pg/v4/payment/request.json",
  verify: "https://payment.zarinpal.com/pg/v4/payment/verify.json",
  startPay: "https://payment.zarinpal.com/pg/StartPay/",
};

const SANDBOX = {
  request: "https://sandbox.zarinpal.com/pg/v4/payment/request.json",
  verify: "https://sandbox.zarinpal.com/pg/v4/payment/verify.json",
  startPay: "https://sandbox.zarinpal.com/pg/StartPay/",
};

export type GatewayMetadata = {
  mobile?: string;
  email?: string;
};

export type GatewayRequest = {
  amountToman: number;
  description: string;
  callbackUrl: string;
  metadata: GatewayMetadata;
};

export type VerifyResult = {
  code: number;
  refId: string | null;
  cardPan: string | null;
};

/** What the callback and the reconcile script both call. The e2e suite swaps in a fake. */
export type PaymentGateway = {
  request(input: GatewayRequest): Promise<{ authority: string }>;
  verify(input: { amountToman: number; authority: string }): Promise<VerifyResult>;
  startPayUrl(authority: string): string;
};

/** Zarinpal refused the request with one of its codes. The code is safe to store. */
export class ZarinpalError extends Error {
  readonly code: number;

  constructor(code: number) {
    super("Zarinpal refused the payment request");
    this.name = "ZarinpalError";
    this.code = code;
  }
}

/** Network failure or a body we could not read. Leave the row PENDING and try again later. */
export class ZarinpalUnavailable extends Error {
  constructor() {
    super("Zarinpal could not be reached");
    this.name = "ZarinpalUnavailable";
  }
}

type DataObject = {
  code?: unknown;
  authority?: unknown;
  ref_id?: unknown;
  card_pan?: unknown;
};

type ZarinpalBody = {
  data?: DataObject | unknown[];
  errors?: { code?: unknown } | { code?: unknown }[];
};

const AUTHORITY = /^[A-Za-z0-9]+$/;

function hosts(sandbox: boolean) {
  return sandbox ? SANDBOX : PRODUCTION;
}

function asObject(value: unknown): DataObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as DataObject;
}

function codeFrom(body: ZarinpalBody): number | null {
  const data = asObject(body.data);
  if (typeof data?.code === "number") return data.code;
  const errors = body.errors;
  if (Array.isArray(errors)) {
    for (const item of errors) {
      if (typeof item?.code === "number") return item.code;
    }
    return null;
  }
  if (typeof errors?.code === "number") return errors.code;
  return null;
}

async function postJson(doFetch: typeof fetch, url: string, body: unknown): Promise<ZarinpalBody> {
  let response: Response;
  try {
    response = await doFetch(url, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ZarinpalUnavailable();
  }
  try {
    const parsed: unknown = await response.json();
    const object = asObject(parsed);
    if (!object) throw new ZarinpalUnavailable();
    return object as ZarinpalBody;
  } catch (error) {
    if (error instanceof ZarinpalUnavailable) throw error;
    throw new ZarinpalUnavailable();
  }
}

function amountOk(amountToman: number): boolean {
  return Number.isInteger(amountToman) && amountToman > 0;
}

export function createZarinpal(options: {
  merchantId: string;
  sandbox: boolean;
  fetch?: typeof fetch;
}): PaymentGateway {
  const url = hosts(options.sandbox);
  const doFetch = options.fetch ?? fetch;

  return {
    startPayUrl(authority) {
      // Only the authority Zarinpal issued is appended. Callers cannot pass a full URL.
      if (!AUTHORITY.test(authority)) throw new ZarinpalError(-54);
      return `${url.startPay}${authority}`;
    },

    async request(input) {
      if (!amountOk(input.amountToman)) throw new ZarinpalError(-9);
      const metadata: GatewayMetadata = {};
      if (input.metadata.mobile) metadata.mobile = input.metadata.mobile;
      if (input.metadata.email) metadata.email = input.metadata.email;
      const body = await postJson(doFetch, url.request, {
        merchant_id: options.merchantId,
        amount: input.amountToman,
        // IRT means the amount is toman. IRR (the default) would charge ten times as much.
        currency: "IRT",
        description: input.description.slice(0, 500),
        callback_url: input.callbackUrl,
        metadata,
      });
      const data = asObject(body.data);
      if (data?.code === 100 && typeof data.authority === "string" && AUTHORITY.test(data.authority)) {
        return { authority: data.authority };
      }
      throw new ZarinpalError(codeFrom(body) ?? -9);
    },

    async verify(input) {
      if (!amountOk(input.amountToman)) throw new ZarinpalError(-9);
      if (!AUTHORITY.test(input.authority)) throw new ZarinpalError(-54);
      // No currency field. The integer must match the request or Zarinpal returns -50.
      const body = await postJson(doFetch, url.verify, {
        merchant_id: options.merchantId,
        amount: input.amountToman,
        authority: input.authority,
      });
      const code = codeFrom(body);
      if (code == null) throw new ZarinpalUnavailable();
      const data = asObject(body.data);
      const ref = data?.ref_id;
      return {
        code,
        refId: typeof ref === "number" || typeof ref === "string" ? String(ref) : null,
        cardPan: typeof data?.card_pan === "string" ? data.card_pan : null,
      };
    },
  };
}

/** The live gateway, using .env.local. Tests pass their own fetch and merchant id instead. */
export function zarinpalFromEnv(): PaymentGateway {
  const env = paymentEnv();
  return createZarinpal({ merchantId: env.merchantId, sandbox: env.sandbox });
}
