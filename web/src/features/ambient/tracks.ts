import type { AmbientId } from "@/lib/settings/catalog";

/** Self-hosted loops. The lead adds the files; a missing file just fails to play. */
export const AMBIENT_URLS: Record<AmbientId, string> = {
  "brown-noise": "/audio/ambient/brown-noise.m4a",
  rain: "/audio/ambient/rain.m4a",
  forest: "/audio/ambient/forest.m4a",
  fire: "/audio/ambient/fire.m4a",
  wind: "/audio/ambient/wind.m4a",
};
