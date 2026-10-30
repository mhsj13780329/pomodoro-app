import { PHONE_EMAIL_DOMAIN } from "@/lib/phone";

/** Phone when we have one. The synthetic phone email is never shown. */
export function displayIdentifier(user: { email: string; phoneNumber?: string | null }): string {
  if (user.phoneNumber) return user.phoneNumber;
  const suffix = `@${PHONE_EMAIL_DOMAIN}`;
  if (user.email.endsWith(suffix)) return user.email.slice(0, -suffix.length);
  return user.email;
}
