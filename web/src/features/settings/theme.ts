export const THEMES = ["warm", "night", "forest"] as const;

export type ThemeId = (typeof THEMES)[number];

export const THEME_COOKIE = "theme";

export const DEFAULT_THEME: ThemeId = "warm";

export function parseTheme(value: string | undefined | null): ThemeId {
  return THEMES.includes(value as ThemeId) ? (value as ThemeId) : DEFAULT_THEME;
}
