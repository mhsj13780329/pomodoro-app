import { AMBIENT_TRACKS, END_SOUNDS, FREE_AMBIENT, isFreeTheme, presetOf, type AmbientMixEntry } from "./catalog";

// Which settings fields a write may change. Pure: the server runs it on every settings
// write and the UI only mirrors it. A field that would create or change a Pro-only value
// for a non-Pro account is dropped (not the whole patch), so an offline queue converges.
// Keeping a stored Pro value is fine (it stays readable after Pro ends), and clearing one is always allowed.

export type GatedSettings = {
  focusMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  longBreakEvery: number;
  themeId: string;
  soundId: string;
  ambientId: string | null;
  focusSoundId: string | null;
  shortBreakSoundId: string | null;
  longBreakSoundId: string | null;
  ambientMix: AmbientMixEntry[] | null;
};

export type GatedField = keyof GatedSettings;

const DURATION_FIELDS = ["focusMin", "shortBreakMin", "longBreakMin", "longBreakEvery"] as const;
const PHASE_SOUND_FIELDS = ["focusSoundId", "shortBreakSoundId", "longBreakSoundId"] as const;

export function sameMix(a: AmbientMixEntry[] | null, b: AmbientMixEntry[] | null): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Catalog checks that apply to everyone (unknown ids are refused for Pro too). */
function isKnown(field: GatedField, value: unknown): boolean {
  if (field === "soundId" || (PHASE_SOUND_FIELDS as readonly string[]).includes(field)) {
    return value === null || (END_SOUNDS as readonly unknown[]).includes(value);
  }
  if (field === "ambientId") return value === null || (AMBIENT_TRACKS as readonly unknown[]).includes(value);
  if (field === "ambientMix") {
    return value === null || (value as AmbientMixEntry[]).every((e) => (AMBIENT_TRACKS as readonly string[]).includes(e.id));
  }
  return true;
}

/**
 * Returns the patch with refused fields removed, and the names of the refused fields.
 * Durations move together: a non-Pro patch that would leave the four durations off a preset
 * drops all four duration fields it carries (unless they leave the stored values unchanged).
 */
export function gateSettingsPatch<P extends Partial<GatedSettings>>(
  stored: GatedSettings,
  patch: P,
  pro: boolean,
): { patch: P; rejected: GatedField[] } {
  const out: Partial<GatedSettings> = { ...patch };
  const rejected: GatedField[] = [];
  const drop = (field: GatedField) => {
    if (field in out) {
      delete out[field];
      rejected.push(field);
    }
  };

  for (const field of Object.keys(patch) as GatedField[]) {
    if (patch[field] !== undefined && !isKnown(field, patch[field])) drop(field);
  }
  if (pro) return { patch: out as P, rejected };

  // Durations: the result must be a preset, or exactly what is stored now.
  const durations = DURATION_FIELDS.some((f) => out[f] !== undefined);
  if (durations) {
    const next = Object.fromEntries(DURATION_FIELDS.map((f) => [f, out[f] ?? stored[f]])) as Pick<
      GatedSettings,
      (typeof DURATION_FIELDS)[number]
    >;
    const unchanged = DURATION_FIELDS.every((f) => next[f] === stored[f]);
    if (!unchanged && presetOf(next) == null) for (const f of DURATION_FIELDS) drop(f);
  }

  if (out.themeId !== undefined && out.themeId !== stored.themeId && !isFreeTheme(out.themeId)) drop("themeId");

  for (const f of PHASE_SOUND_FIELDS) {
    const v = out[f];
    if (v !== undefined && v !== null && v !== stored[f]) drop(f);
  }

  if (out.ambientId !== undefined && out.ambientId !== null && out.ambientId !== stored.ambientId && out.ambientId !== FREE_AMBIENT) {
    drop("ambientId");
  }

  if (out.ambientMix !== undefined && out.ambientMix !== null && !sameMix(out.ambientMix, stored.ambientMix)) drop("ambientMix");

  return { patch: out as P, rejected };
}
