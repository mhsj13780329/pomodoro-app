import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, localeFromPathname, localeRedirectPath, routing } from "./i18n/routing";

const handleI18n = createMiddleware(routing);

const oneYear = 60 * 60 * 24 * 365;

function remember(response: NextResponse, locale: string) {
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: oneYear,
    sameSite: "lax",
  });
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Unprefixed URLs follow the language saved in Settings.
  // Accept-Language is not read, so a first visit always lands on Farsi.
  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  const target = localeRedirectPath(pathname, saved);
  if (target) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    const response = NextResponse.redirect(url);
    const locale = localeFromPathname(target);
    if (locale) remember(response, locale);
    return response;
  }

  const response = handleI18n(request);
  const locale = localeFromPathname(pathname);
  if (locale) remember(response, locale);
  return response;
}

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
