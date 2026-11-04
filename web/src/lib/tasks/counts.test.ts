import { describe, expect, it } from "vitest";
import { adoptServerCounts, countCompletedFocus, noteUploaded, pomodoroCounts, type ServerCounts } from "./counts";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const server = (counts: Record<string, number>, countedIds: string[] = []): ServerCounts => ({ counts, countedIds });
const focus = (id: string, taskId: string) => ({ id, phase: "focus", completed: true, taskId });

describe("countCompletedFocus", () => {
  it("counts completed focus sessions per task", () => {
    const counts = countCompletedFocus([
      { id: "1", phase: "focus", completed: true, taskId: A },
      { id: "2", phase: "focus", completed: true, taskId: A },
      { id: "3", phase: "focus", completed: true, taskId: B },
    ]);
    expect(counts).toEqual({ [A]: 2, [B]: 1 });
  });

  it("ignores breaks, unfinished focus and sessions without a task", () => {
    const counts = countCompletedFocus([
      { id: "1", phase: "shortBreak", completed: true, taskId: A },
      { id: "2", phase: "longBreak", completed: true, taskId: A },
      { id: "3", phase: "focus", completed: false, taskId: A },
      { id: "4", phase: "focus", completed: true, taskId: null },
      { id: "5", phase: "focus", completed: true },
    ]);
    expect(counts).toEqual({});
  });

  it("counts a repeated session id once", () => {
    const counts = countCompletedFocus([
      { id: "1", phase: "focus", completed: true, taskId: A },
      { id: "1", phase: "focus", completed: true, taskId: A },
    ]);
    expect(counts).toEqual({ [A]: 1 });
  });

  it("has no counter to forget: an empty history is zero", () => {
    expect(countCompletedFocus([])).toEqual({});
  });
});

describe("pomodoroCounts", () => {
  it("adds sessions that are still waiting to upload", () => {
    const merged = pomodoroCounts(server({ [A]: 2 }), [
      { id: "p1", phase: "focus", completed: true, taskId: A },
      { id: "p2", phase: "focus", completed: true, taskId: B },
    ]);
    expect(merged).toEqual({ [A]: 3, [B]: 1 });
  });

  it("does not change the server counts it was given", () => {
    const given = server({ [A]: 1 });
    pomodoroCounts(given, [focus("p1", A)]);
    expect(given.counts).toEqual({ [A]: 1 });
  });

  it("counts a waiting session once even if it is queued twice", () => {
    const merged = pomodoroCounts(server({}), [
      { id: "p1", phase: "focus", completed: true, taskId: A },
      { id: "p1", phase: "focus", completed: true, taskId: A },
    ]);
    expect(merged).toEqual({ [A]: 1 });
  });

  it("does not add a waiting session the server already counted", () => {
    expect(pomodoroCounts(server({ [A]: 1 }, ["s1"]), [focus("s1", A), focus("s2", A)])).toEqual({ [A]: 2 });
  });
});

describe("the life of one focus", () => {
  it("counts once whether the pull lands before or after the upload", () => {
    const queued = [focus("s1", A)];
    // Pull first: the server already stored s1 with the timer's complete.
    let snap = adoptServerCounts({ counts: { [A]: 1 }, countedIds: ["s1"] });
    expect(pomodoroCounts(snap, queued)).toEqual({ [A]: 1 });
    snap = noteUploaded(snap, queued);
    expect(pomodoroCounts(snap, [])).toEqual({ [A]: 1 });

    // Upload first: the last pull did not include s1 yet.
    let early = adoptServerCounts({ counts: {}, countedIds: [] });
    expect(pomodoroCounts(early, queued)).toEqual({ [A]: 1 });
    early = noteUploaded(early, queued);
    expect(pomodoroCounts(early, [])).toEqual({ [A]: 1 });
    expect(pomodoroCounts(adoptServerCounts({ counts: { [A]: 1 }, countedIds: ["s1"] }), [])).toEqual({ [A]: 1 });
  });

  it("noting the same upload twice counts it once", () => {
    const once = noteUploaded(server({}), [focus("s1", A)]);
    expect(noteUploaded(once, [focus("s1", A)]).counts).toEqual({ [A]: 1 });
  });
});
