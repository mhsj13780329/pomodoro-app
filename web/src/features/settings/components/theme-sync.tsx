"use client";

import { useLayoutEffect } from "react";
import { THEME_COOKIE, parseTheme } from "../theme";

/** Keeps data-theme on <html> after a locale change. The server shell always
    starts on warm; the cookie is applied before the browser paints. */
export function ThemeSync() {
  useLayoutEffect(() => {
    const match = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`));
    const value = match ? decodeURIComponent(match[1]) : undefined;
    document.documentElement.dataset.theme = parseTheme(value);
  }, []);
  return null;
}
