import { ExpiryBanner } from "@/features/pricing/components/expiry-banner";
import { getCurrentUser } from "@/lib/current-user";
import { bannerKindNow } from "@/lib/payments/reminders";
import { prisma } from "@/lib/prisma";

/** Reads Pro from the user row. Guests and lifetime plans see nothing. */
export async function ExpiryBannerSlot() {
  const session = await getCurrentUser();
  if (!session) return null;
  const account = await prisma.user.findUnique({
    where: { id: session.id },
    select: { proUntil: true, proLifetime: true, timezone: true },
  });
  const kind = bannerKindNow(account?.proUntil ?? null, account?.proLifetime === true);
  if (!kind) return null;
  return <ExpiryBanner kind={kind} timeZone={account?.timezone || "Asia/Tehran"} />;
}
