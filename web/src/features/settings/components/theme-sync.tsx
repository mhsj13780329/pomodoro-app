"use client";

import { useLayoutEffect } from "react";
import { THEME_COOKIE, parseTheme, publishTheme } from "../theme";

/** Keeps data-theme on <html> after a locale change. The server shell always
    starts on warm; the cookie is applied before the browser paints. */
export function ThemeSync() {
  useLayoutEffect(() => {
    const match = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`));
    const value = match ? decodeURIComponent(match[1]) : undefined;
    const theme = parseTheme(value);
    document.documentElement.dataset.theme = theme;
    publishTheme(theme);
  }, []);
  return null;
}
