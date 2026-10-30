import { describe, expect, it } from "vitest";
import { decideImport, decideTaskImport, type ImportSettings, type ImportTask } from "./import-merge";

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

function guestTask(id: string, patch: Partial<ImportTask> = {}): ImportTask {
  return {
    id,
    title: id,
    done: false,
    doneAt: null,
    order: 0,
    createdAt: "2026-10-30T10:00:00.000Z",
    updatedAt: "2026-10-30T10:00:00.000Z",
    ...patch,
  };
}

const room = { knownIds: new Set<string>(), foreignIds: new Set<string>(), activeCount: 0, maxOrder: -1, pro: false };

describe("decideTaskImport", () => {
  it("imports guest tasks into an empty account, keeping their order", () => {
    const result = decideTaskImport(room, [guestTask("b", { order: 1 }), guestTask("a", { order: 0 })], 10);
    expect(result.insert.map((task) => [task.id, task.order])).toEqual([
      ["a", 0],
      ["b", 1],
    ]);
    expect(result.skipped).toBe(0);
  });

  it("places imported tasks after the ones the account already has", () => {
    const result = decideTaskImport({ ...room, maxOrder: 4 }, [guestTask("a")], 10);
    expect(result.insert[0]?.order).toBe(5);
  });

  it("inserts nothing the second time", () => {
    const result = decideTaskImport({ ...room, knownIds: new Set(["a"]) }, [guestTask("a")], 10);
    expect(result).toEqual({ insert: [], skipped: 0 });
  });

  it("never touches an id that belongs to someone else", () => {
    const result = decideTaskImport({ ...room, foreignIds: new Set(["a"]) }, [guestTask("a")], 10);
    expect(result.insert).toEqual([]);
  });

  it("stops a free account at the active limit but always keeps done tasks", () => {
    const incoming = [
      guestTask("a", { order: 0 }),
      guestTask("b", { order: 1 }),
      guestTask("c", { order: 2 }),
      guestTask("finished", { order: 3, done: true, doneAt: "2026-10-30T10:00:00.000Z" }),
    ];
    const result = decideTaskImport({ ...room, activeCount: 8 }, incoming, 10);
    expect(result.insert.map((task) => task.id)).toEqual(["a", "b", "finished"]);
    expect(result.skipped).toBe(1);
  });

  it("does not let a repeated import add more than the limit", () => {
    const result = decideTaskImport({ ...room, activeCount: 10 }, [guestTask("x")], 10);
    expect(result).toEqual({ insert: [], skipped: 1 });
  });

  it("imports everything for Pro", () => {
    const many = Array.from({ length: 15 }, (_, index) => guestTask(`t${index}`, { order: index }));
    const result = decideTaskImport({ ...room, pro: true, activeCount: 30 }, many, 10);
    expect(result.insert).toHaveLength(15);
  });

  it("counts a repeated id in one upload once", () => {
    const result = decideTaskImport(room, [guestTask("a"), guestTask("a")], 10);
    expect(result.insert).toHaveLength(1);
  });
});
