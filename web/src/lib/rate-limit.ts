import { prisma } from "./prisma";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;

/**
 * Caps sync calls per signed-in user.
 * Polling is one request every 15 seconds, so 120 a minute still leaves room
 * for a burst of pause/resume. The row lives in the same table as OTP limits
 * so a restart does not wipe the count. The key prefix keeps the two apart.
 */
export async function allowSyncRequest(userId: string): Promise<boolean> {
  const key = `sync:${userId}`;
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const row = await tx.otpRateLimit.findUnique({ where: { key } });
    const fresh = !row || now.getTime() - row.windowStart.getTime() >= WINDOW_MS;
    if (fresh) {
      await tx.otpRateLimit.upsert({
        where: { key },
        create: { key, windowStart: now, count: 1 },
        update: { windowStart: now, count: 1 },
      });
      return true;
    }
    if (row.count >= MAX_PER_WINDOW) return false;
    await tx.otpRateLimit.update({
      where: { key },
      data: { count: { increment: 1 } },
    });
    return true;
  });
}
