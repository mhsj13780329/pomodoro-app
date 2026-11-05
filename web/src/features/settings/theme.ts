import { THEME_IDS, type ThemeId } from "@/lib/settings/catalog";

export { FREE_THEMES, isFreeTheme } from "@/lib/settings/catalog";
export type { ThemeId };

export const THEMES = THEME_IDS;

export const THEME_COOKIE = "theme";

export const DEFAULT_THEME: ThemeId = "warm";

export function parseTheme(value: string | undefined | null): ThemeId {
  return (THEMES as readonly string[]).includes(value as string) ? (value as ThemeId) : DEFAULT_THEME;
}

let current: ThemeId = DEFAULT_THEME;
const listeners = new Set<() => void>();

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentTheme(): ThemeId {
  return current;
}

export function serverTheme(): ThemeId {
  return DEFAULT_THEME;
}

function publish(next: ThemeId) {
  current = next;
  for (const listener of listeners) listener();
}

/** Updates the swatch state without writing the cookie again. */
export function publishTheme(value: string | undefined | null) {
  publish(parseTheme(value));
}

/** Saves the theme on this device and tells open pickers. Sync calls this too. */
export function applyTheme(value: string | undefined | null) {
  const next = parseTheme(value);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }
  publish(next);
}
