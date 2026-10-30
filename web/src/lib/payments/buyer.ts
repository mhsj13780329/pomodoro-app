import { PHONE_EMAIL_DOMAIN } from "@/lib/phone";

/** Zarinpal's metadata example is 0912…, not +98912…. Other countries are omitted. */
export function gatewayMobile(phone: string | null | undefined): string | undefined {
  if (!phone?.startsWith("+98") || phone.length !== 13) return undefined;
  return `0${phone.slice(3)}`;
}

/** Phone-only accounts have a fake email that cannot receive mail. Don't send it to Zarinpal. */
export function gatewayEmail(email: string | null | undefined): string | undefined {
  if (!email || email.endsWith(`@${PHONE_EMAIL_DOMAIN}`)) return undefined;
  return email;
}
