import "server-only";
import { prisma } from "@/lib/prisma";
import type { Entitlement } from "@/lib/pro";

/**
 * Reads the signed-in user's Pro fields. Read it once per request and pass the result to
 * requirePro() / isProActive(); the user row is the only place Pro is stored.
 * A missing user counts as free.
 */
export async function loadEntitlement(userId: string): Promise<Entitlement> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { proUntil: true, proLifetime: true },
  });
  return { proUntil: user?.proUntil ?? null, proLifetime: user?.proLifetime ?? false };
}
