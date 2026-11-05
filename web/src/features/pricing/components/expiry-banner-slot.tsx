import { ExpiryBanner } from "@/features/pricing/components/expiry-banner";
import { getCurrentUser } from "@/lib/current-user";
import { loadProStatus } from "@/lib/entitlement";

/** Reads Pro from the user row. Guests and lifetime plans see nothing. */
export async function ExpiryBannerSlot() {
  const session = await getCurrentUser();
  if (!session) return null;
  const pro = await loadProStatus(session.id);
  if (!pro.banner) return null;
  return <ExpiryBanner kind={pro.banner} timeZone={pro.timeZone} />;
}
