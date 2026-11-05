import { describe, expect, it } from "vitest";
import { clampVolume, isMixFull, isSelectable, playlistOf, selectableTracks, setMixVolume, toggleInMix } from "./mix";

describe("selectable tracks", () => {
  it("lets free users pick only rain", () => {
    expect(selectableTracks(false)).toEqual(["rain"]);
    expect(isSelectable("brown-noise", false)).toBe(false);
  });
  it("lets Pro pick every known track and nothing else", () => {
    expect(isSelectable("rain", true)).toBe(true);
    expect(isSelectable("nope", true)).toBe(false);
  });
});

describe("toggleInMix", () => {
  it("adds and removes", () => {
    const added = toggleInMix([], "rain");
    expect(added.mix).toEqual([{ id: "rain", volume: 0.6 }]);
    expect(toggleInMix(added.mix, "rain").mix).toEqual([]);
  });
  it("refuses a fifth track but still removes at the max", () => {
    const full = ["rain", "forest", "brown-noise", "fire"].map((id) => ({ id, volume: 0.5 }));
    expect(isMixFull(full)).toBe(true);
    expect(toggleInMix(full, "wind")).toEqual({ mix: full, changed: false });
    expect(toggleInMix(full, "fire").mix).toHaveLength(3);
  });
  it("ignores unknown ids", () => {
    expect(toggleInMix([], "x").changed).toBe(false);
  });
});

describe("volume", () => {
  it("clamps", () => {
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume(-1)).toBe(0);
    expect(setMixVolume([{ id: "rain", volume: 0.1 }], "rain", 5)).toEqual([{ id: "rain", volume: 1 }]);
  });
});

describe("playlistOf", () => {
  it("prefers a stored mix", () => {
    expect(playlistOf("brown-noise", [{ id: "rain", volume: 0.3 }])).toEqual([{ id: "rain", volume: 0.3 }]);
  });
  it("falls back to the single track and drops unknown ids", () => {
    expect(playlistOf("brown-noise", null, 0.4)).toEqual([{ id: "brown-noise", volume: 0.4 }]);
    expect(playlistOf("zzz", null)).toEqual([]);
    expect(playlistOf(null, null)).toEqual([]);
  });
});
