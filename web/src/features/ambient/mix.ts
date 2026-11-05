import { AMBIENT_TRACKS, FREE_AMBIENT, MAX_MIX_TRACKS, type AmbientMixEntry } from "@/lib/settings/catalog";

export const DEFAULT_VOLUME = 0.6;

export function clampVolume(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME;
}

export function isKnownTrack(id: string): boolean {
  return (AMBIENT_TRACKS as readonly string[]).includes(id);
}

/** A non-Pro user may only choose the free track. Pro may choose any. */
export function isSelectable(id: string, pro: boolean): boolean {
  return isKnownTrack(id) && (pro || id === FREE_AMBIENT);
}

export function selectableTracks(pro: boolean): string[] {
  return AMBIENT_TRACKS.filter((id) => isSelectable(id, pro));
}

/** What to play: a stored mix wins (even for a non-Pro user), else the single track. Unknown ids are skipped. */
export function playlistOf(
  ambientId: string | null,
  mix: AmbientMixEntry[] | null,
  singleVolume: number = DEFAULT_VOLUME,
): AmbientMixEntry[] {
  const source = mix && mix.length > 0 ? mix : ambientId ? [{ id: ambientId, volume: singleVolume }] : [];
  return source.filter((e) => isKnownTrack(e.id)).slice(0, MAX_MIX_TRACKS).map((e) => ({ id: e.id, volume: clampVolume(e.volume) }));
}

/** Adds the track, or removes it when already there. Refuses to go past the max. */
export function toggleInMix(
  mix: AmbientMixEntry[],
  id: string,
  max: number = MAX_MIX_TRACKS,
  volume: number = DEFAULT_VOLUME,
): { mix: AmbientMixEntry[]; changed: boolean } {
  if (mix.some((e) => e.id === id)) return { mix: mix.filter((e) => e.id !== id), changed: true };
  if (!isKnownTrack(id) || mix.length >= max) return { mix, changed: false };
  return { mix: [...mix, { id, volume: clampVolume(volume) }], changed: true };
}

export function setMixVolume(mix: AmbientMixEntry[], id: string, volume: number): AmbientMixEntry[] {
  return mix.map((e) => (e.id === id ? { id, volume: clampVolume(volume) } : e));
}

export function isMixFull(mix: AmbientMixEntry[], max: number = MAX_MIX_TRACKS): boolean {
  return mix.length >= max;
}
