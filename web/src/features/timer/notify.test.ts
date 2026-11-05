import { describe, expect, it } from "vitest";
import { endedPhaseOf, soundForPhase, voicesOf } from "./notify";

const base = { soundId: "bell", focusSoundId: null, shortBreakSoundId: null, longBreakSoundId: null };

describe("soundForPhase", () => {
  it("falls back to the end sound", () => {
    expect(soundForPhase("focus", base)).toBe("bell");
    expect(soundForPhase("longBreak", base)).toBe("bell");
  });
  it("prefers the phase sound", () => {
    const s = { ...base, focusSoundId: "soft", shortBreakSoundId: "none", longBreakSoundId: "digital" };
    expect(soundForPhase("focus", s)).toBe("soft");
    expect(soundForPhase("shortBreak", s)).toBe("none");
    expect(soundForPhase("longBreak", s)).toBe("digital");
  });
});

describe("endedPhaseOf", () => {
  it("maps the phase now showing to the one that ended", () => {
    expect(endedPhaseOf("shortBreak", 1)).toBe("focus");
    expect(endedPhaseOf("longBreak", 4)).toBe("focus");
    expect(endedPhaseOf("focus", 2)).toBe("shortBreak");
    expect(endedPhaseOf("focus", 0)).toBe("longBreak");
  });
});

describe("voicesOf", () => {
  it("is silent for none and sounds for the rest", () => {
    expect(voicesOf("none")).toEqual([]);
    for (const id of ["default", "bell", "digital", "soft"]) expect(voicesOf(id).length).toBeGreaterThan(0);
  });
});
