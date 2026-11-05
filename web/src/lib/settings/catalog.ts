// What the app offers, and which part of it is free. Pure data, shared by the server gate and the UI.

export const FREE_THEMES = ["warm", "night", "forest"] as const;
export const PRO_THEMES = ["ocean", "dusk", "rose", "slate", "sand"] as const;
export const THEME_IDS = [...FREE_THEMES, ...PRO_THEMES] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export function isFreeTheme(id: string): boolean {
  return (FREE_THEMES as readonly string[]).includes(id);
}

/** Free timers must be exactly one of these. Pro may use any durations. */
export const TIMER_PRESETS = [
  { id: "classic", focusMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
  { id: "long", focusMin: 50, shortBreakMin: 10, longBreakMin: 20, longBreakEvery: 4 },
] as const;

export type TimerDurations = {
  focusMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  longBreakEvery: number;
};

export function presetOf(d: TimerDurations): (typeof TIMER_PRESETS)[number]["id"] | null {
  const hit = TIMER_PRESETS.find(
    (p) =>
      p.focusMin === d.focusMin &&
      p.shortBreakMin === d.shortBreakMin &&
      p.longBreakMin === d.longBreakMin &&
      p.longBreakEvery === d.longBreakEvery,
  );
  return hit ? hit.id : null;
}

/** End-of-phase sounds, synthesized in features/timer/notify.ts. Any user may pick the one sound; per-phase is Pro. */
export const END_SOUNDS = ["default", "bell", "digital", "soft", "none"] as const;
export type EndSoundId = (typeof END_SOUNDS)[number];

/** Self-hosted loops in public/audio/ambient/<id>.<ext>. */
export const FREE_AMBIENT = "brown-noise";
export const AMBIENT_TRACKS = [FREE_AMBIENT, "rain", "forest", "fire", "wind"] as const;
export type AmbientId = (typeof AMBIENT_TRACKS)[number];
export const MAX_MIX_TRACKS = 4;

export type AmbientMixEntry = { id: string; volume: number };
