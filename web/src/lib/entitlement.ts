import "server-only";
import { prisma } from "@/lib/prisma";
import { validTimeZone } from "@/lib/calendar";
import { proStatus, type Entitlement, type ProStatus } from "@/lib/pro";

/**
 * Reads the signed-in user's Pro fields. Read it once per request and pass the result to
 * isProActive() / requirePro() (or use loadProStatus for a page); the user row is the only place Pro is stored.
 * A missing user counts as free.
 */
export async function loadEntitlement(userId: string): Promise<Entitlement> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { proUntil: true, proLifetime: true },
  });
  return { proUntil: user?.proUntil ?? null, proLifetime: user?.proLifetime ?? false };
}

/**
 * What a page shows about the signed-in user's Pro: status, banner and the zone to print dates in.
 * One read of the user row. A missing user counts as free, in the default zone.
 */
export async function loadProStatus(userId: string, now: number = Date.now()): Promise<ProStatus & { timeZone: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { proUntil: true, proLifetime: true, timezone: true },
  });
  const status = proStatus({ proUntil: user?.proUntil ?? null, proLifetime: user?.proLifetime ?? false }, now);
  return { ...status, timeZone: validTimeZone(user?.timezone) };
}
