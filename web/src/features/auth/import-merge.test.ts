import { describe, expect, it } from "vitest";
import { decideImport, type ImportSettings } from "./import-merge";

const settings: ImportSettings = {
  focusMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4,
  autoStartFocus: false,
  autoStartShortBreak: true,
  autoStartLongBreak: true,
  themeId: "warm",
};

describe("decideImport", () => {
  it("writes settings and sessions when the account is empty", () => {
    const decision = decideImport(
      { hasSettings: false, sessionIds: new Set() },
      { settings, sessions: [{ id: "a" }, { id: "b" }] },
    );
    expect(decision.settings).toEqual(settings);
    expect(decision.sessions.map((session) => session.id)).toEqual(["a", "b"]);
  });

  it("keeps server settings and skips session ids that already exist", () => {
    const decision = decideImport(
      { hasSettings: true, sessionIds: new Set(["a"]) },
      { settings: { ...settings, focusMin: 50 }, sessions: [{ id: "a" }, { id: "b" }, { id: "b" }] },
    );
    expect(decision.settings).toBeNull();
    expect(decision.sessions.map((session) => session.id)).toEqual(["b"]);
  });
});
