import { defineRouting } from "next-intl/routing";

export const locales = ["fa", "en", "es", "fr", "de", "ja", "ko"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "fa";

/** Saved by the proxy when a locale-prefixed page is opened. Not next-intl's cookie. */
export const LOCALE_COOKIE = "locale";

export const routing = defineRouting({
  locales: [...locales],
  defaultLocale,
  localePrefix: "always",
  // Off so next-intl does not read this cookie or Accept-Language.
  // The proxy below decides unprefixed URLs itself.
  localeDetection: false,
  localeCookie: false,
});

export function isLocale(value: string | undefined): value is Locale {
  return locales.includes(value as Locale);
}

export function dirFor(locale: Locale): "rtl" | "ltr" {
  return locale === "fa" ? "rtl" : "ltr";
}

export function localeFromPathname(pathname: string): Locale | null {
  const segment = pathname.split("/")[1];
  return isLocale(segment) ? segment : null;
}

/**
 * Where an unprefixed path should go.
 * Returns null when the path already starts with a known locale.
 * The cookie is the language saved in Settings. Accept-Language is not an input.
 */
export function localeRedirectPath(pathname: string, cookie: string | undefined): string | null {
  if (localeFromPathname(pathname)) return null;
  const locale = isLocale(cookie) ? cookie : defaultLocale;
  if (pathname === "/") return `/${locale}`;
  return `/${locale}${pathname}`;
}
