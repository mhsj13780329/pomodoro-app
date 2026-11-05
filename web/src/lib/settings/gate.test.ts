import { describe, expect, it } from "vitest";
import { gateSettingsPatch, type GatedSettings } from "./gate";

const stored: GatedSettings = {
  focusMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4,
  themeId: "warm",
  soundId: "default",
  ambientId: null,
  focusSoundId: null,
  shortBreakSoundId: null,
  longBreakSoundId: null,
  ambientMix: null,
};

const mix = [{ id: "rain", volume: 0.5 }];
const long = { focusMin: 50, shortBreakMin: 10, longBreakMin: 20, longBreakEvery: 4 };
const custom = { focusMin: 33, shortBreakMin: 7, longBreakMin: 17, longBreakEvery: 3 };

describe("gateSettingsPatch for a free account", () => {
  it("accepts a preset", () => {
    expect(gateSettingsPatch(stored, long, false)).toEqual({ patch: long, rejected: [] });
  });

  it("drops custom durations (all four) and keeps the other fields", () => {
    const res = gateSettingsPatch(stored, { ...custom, soundId: "bell" }, false);
    expect(res.patch).toEqual({ soundId: "bell" });
    expect([...res.rejected].sort()).toEqual(["focusMin", "longBreakEvery", "longBreakMin", "shortBreakMin"]);
  });

  it("allows keeping a stored custom set", () => {
    const withCustom = { ...stored, ...custom };
    expect(gateSettingsPatch(withCustom, { focusMin: 33, soundId: "bell" }, false).rejected).toEqual([]);
  });

  it("drops a Pro theme", () => {
    expect(gateSettingsPatch(stored, { themeId: "ocean" }, false)).toEqual({ patch: {}, rejected: ["themeId"] });
  });

  it("accepts a free theme", () => {
    expect(gateSettingsPatch(stored, { themeId: "night" }, false).rejected).toEqual([]);
  });

  it("keeps a stored Pro theme", () => {
    const withPro = { ...stored, themeId: "ocean" };
    expect(gateSettingsPatch(withPro, { themeId: "ocean" }, false).rejected).toEqual([]);
    expect(gateSettingsPatch(withPro, { themeId: "dusk" }, false).rejected).toEqual(["themeId"]);
    expect(gateSettingsPatch(withPro, { themeId: "warm" }, false).rejected).toEqual([]);
  });

  it("drops a per-phase sound but allows clearing it", () => {
    expect(gateSettingsPatch(stored, { focusSoundId: "bell" }, false).rejected).toEqual(["focusSoundId"]);
    const withSound = { ...stored, shortBreakSoundId: "soft" };
    expect(gateSettingsPatch(withSound, { shortBreakSoundId: null }, false)).toEqual({
      patch: { shortBreakSoundId: null },
      rejected: [],
    });
    expect(gateSettingsPatch(withSound, { shortBreakSoundId: "soft" }, false).rejected).toEqual([]);
  });

  it("allows the free ambient track and drops others", () => {
    expect(gateSettingsPatch(stored, { ambientId: "brown-noise" }, false).rejected).toEqual([]);
    expect(gateSettingsPatch(stored, { ambientId: "rain" }, false).rejected).toEqual(["ambientId"]);
    expect(gateSettingsPatch(stored, { ambientId: null }, false).rejected).toEqual([]);
  });

  it("drops a mix but allows clearing it", () => {
    expect(gateSettingsPatch(stored, { ambientMix: mix }, false).rejected).toEqual(["ambientMix"]);
    const withMix = { ...stored, ambientMix: mix };
    expect(gateSettingsPatch(withMix, { ambientMix: null }, false)).toEqual({ patch: { ambientMix: null }, rejected: [] });
    expect(gateSettingsPatch(withMix, { ambientMix: [{ id: "rain", volume: 0.5 }] }, false).rejected).toEqual([]);
  });
});

describe("gateSettingsPatch for a Pro account", () => {
  it("passes everything known", () => {
    const patch = {
      ...custom,
      themeId: "sand",
      focusSoundId: "bell",
      shortBreakSoundId: "soft",
      longBreakSoundId: "digital",
      ambientId: "rain",
      ambientMix: mix,
    };
    expect(gateSettingsPatch(stored, patch, true)).toEqual({ patch, rejected: [] });
  });

  it("drops unknown sound and track ids", () => {
    const res = gateSettingsPatch(
      stored,
      { soundId: "nope", focusSoundId: "nope", ambientId: "nope", ambientMix: [{ id: "nope", volume: 1 }], focusMin: 40 },
      true,
    );
    expect(res.patch).toEqual({ focusMin: 40 });
    expect([...res.rejected].sort()).toEqual(["ambientId", "ambientMix", "focusSoundId", "soundId"]);
  });
});
