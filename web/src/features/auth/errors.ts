export type AuthErrorKey =
  | "invalidPhone"
  | "invalidEmail"
  | "invalidCode"
  | "expiredCode"
  | "tooManyAttempts"
  | "cooldown"
  | "rateLimited"
  | "generic";

/** Maps the codes the installed Better Auth plugins actually return. */
export function authErrorKey(error: { code?: string; status?: number } | null | undefined): AuthErrorKey {
  const code = error?.code ?? "";
  if (code === "INVALID_PHONE_NUMBER") return "invalidPhone";
  if (code === "INVALID_OTP" || code === "OTP_NOT_FOUND") return "invalidCode";
  if (code === "OTP_EXPIRED") return "expiredCode";
  if (code === "TOO_MANY_ATTEMPTS") return "tooManyAttempts";
  if (code === "OTP_COOLDOWN") return "cooldown";
  if (code === "OTP_RATE_LIMITED" || error?.status === 429) return "rateLimited";
  return "generic";
}
