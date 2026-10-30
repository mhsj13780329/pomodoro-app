import { describe, expect, it } from "vitest";
import { mergeSettings, type SyncSettings } from "./settings-lww";

const stored: SyncSettings = {
  focusMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4,
  autoStartFocus: false,
  autoStartShortBreak: true,
  autoStartLongBreak: true,
  themeId: "warm",
  soundId: "default",
  ambientId: null,
  notificationsOn: true,
  updatedAt: 1_000,
};

describe("settings last-write-wins", () => {
  it("ignores an older write", () => {
    const next = mergeSettings(stored, 500, { focusMin: 50 });
    expect(next).toBe(stored);
  });

  it("keeps the stored row when the timestamps are equal", () => {
    const next = mergeSettings(stored, 1_000, { focusMin: 50, themeId: "night" });
    expect(next).toBe(stored);
  });

  it("applies a newer partial write and leaves the other fields", () => {
    const next = mergeSettings(stored, 2_000, { focusMin: 50, themeId: "forest" });
    expect(next.focusMin).toBe(50);
    expect(next.themeId).toBe("forest");
    expect(next.shortBreakMin).toBe(5);
    expect(next.updatedAt).toBe(2_000);
    expect(stored.focusMin).toBe(25);
  });
});
