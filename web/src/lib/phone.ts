const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Iranian mobile numbers in E.164: +98 then 9 and nine more digits. */
const E164 = /^\+989\d{9}$/;

/** Better Auth requires an email. Phone accounts use this domain, which cannot receive mail. */
export const PHONE_EMAIL_DOMAIN = "phone.pomodoro.invalid";

export function syntheticPhoneEmail(e164: string): string {
  return `${e164.replace(/^\+/, "")}@${PHONE_EMAIL_DOMAIN}`;
}

/** Persian and Arabic-Indic digits become ASCII 0-9. Other characters stay. */
export function toAsciiDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (char) => {
    const persian = PERSIAN_DIGITS.indexOf(char);
    if (persian >= 0) return String(persian);
    return String(ARABIC_DIGITS.indexOf(char));
  });
}

export type PhoneResult = { ok: true; e164: string } | { ok: false };

/**
 * Accepts an Iranian mobile number in the forms people actually type,
 * and returns E.164. Landlines and other countries are rejected.
 */
export function normalizeIranMobile(input: string): PhoneResult {
  const compact = toAsciiDigits(input).replace(/[\s\-()]/g, "");
  let rest = compact;
  if (rest.startsWith("+")) rest = rest.slice(1);
  if (rest.startsWith("0098")) rest = rest.slice(4);
  else if (rest.startsWith("98") && rest.length === 12) rest = rest.slice(2);
  else if (rest.startsWith("0") && rest.length === 11) rest = rest.slice(1);

  if (!/^9\d{9}$/.test(rest)) return { ok: false };
  const e164 = `+98${rest}`;
  if (!E164.test(e164)) return { ok: false };
  return { ok: true, e164 };
}
