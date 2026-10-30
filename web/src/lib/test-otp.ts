// Only for the Playwright suite. Better Auth stores OTPs hashed, so a test
// cannot read them from the database. When E2E_OTP=1 the mailer also keeps the
// latest plaintext code per address in memory. Outside that mode nothing is
// stored and the route that reads it answers 404.

const KEY = "__pomodoroTestOtp";

type Store = Map<string, string>;

function store(): Store {
  const holder = globalThis as typeof globalThis & { [KEY]?: Store };
  holder[KEY] ??= new Map();
  return holder[KEY];
}

export function testOtpEnabled(): boolean {
  return process.env.E2E_OTP === "1" && process.env.NODE_ENV !== "production";
}

export function rememberTestOtp(to: string, code: string): void {
  if (!testOtpEnabled()) return;
  store().set(to.trim().toLowerCase(), code);
}

export function readTestOtp(to: string): string | null {
  if (!testOtpEnabled()) return null;
  return store().get(to.trim().toLowerCase()) ?? null;
}
