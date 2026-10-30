import { prisma } from "./prisma";

const COOLDOWN_SEC = 60;
const WINDOW_SEC = 10 * 60;

export type OtpLimitCode = "OTP_COOLDOWN" | "OTP_RATE_LIMITED";

export class OtpRateLimitError extends Error {
  readonly code: OtpLimitCode;

  constructor(code: OtpLimitCode) {
    super(code);
    this.code = code;
  }
}

/**
 * Allows the send, or throws.
 * One code per phone or email each minute, five per ten minutes,
 * and twenty per IP each ten minutes. Rows survive a server restart.
 */
export async function assertOtpSendAllowed(input: {
  kind: "phone" | "email";
  identifier: string;
  ip: string;
}): Promise<void> {
  const ipAllowed = await take(`ip:${input.ip}`, WINDOW_SEC, 20);
  if (!ipAllowed) throw new OtpRateLimitError("OTP_RATE_LIMITED");

  const cooled = await take(`cd:${input.kind}:${input.identifier}`, COOLDOWN_SEC, 1);
  if (!cooled) throw new OtpRateLimitError("OTP_COOLDOWN");

  const burst = await take(`burst:${input.kind}:${input.identifier}`, WINDOW_SEC, 5);
  if (!burst) throw new OtpRateLimitError("OTP_RATE_LIMITED");
}

async function take(key: string, windowSec: number, max: number): Promise<boolean> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const row = await tx.otpRateLimit.findUnique({ where: { key } });
    const fresh = !row || now.getTime() - row.windowStart.getTime() >= windowSec * 1000;
    if (fresh) {
      await tx.otpRateLimit.upsert({
        where: { key },
        create: { key, windowStart: now, count: 1 },
        update: { windowStart: now, count: 1 },
      });
      return true;
    }
    if (row.count >= max) return false;
    await tx.otpRateLimit.update({
      where: { key },
      data: { count: { increment: 1 } },
    });
    return true;
  });
}
