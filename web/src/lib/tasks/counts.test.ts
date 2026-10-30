import { describe, expect, it } from "vitest";
import { countCompletedFocus, pomodoroCounts } from "./counts";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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
    const merged = pomodoroCounts({ [A]: 2 }, [
      { id: "p1", phase: "focus", completed: true, taskId: A },
      { id: "p2", phase: "focus", completed: true, taskId: B },
    ]);
    expect(merged).toEqual({ [A]: 3, [B]: 1 });
  });

  it("does not change the server counts it was given", () => {
    const server = { [A]: 1 };
    pomodoroCounts(server, [{ id: "p1", phase: "focus", completed: true, taskId: A }]);
    expect(server).toEqual({ [A]: 1 });
  });

  it("counts a waiting session once even if it is queued twice", () => {
    const merged = pomodoroCounts({}, [
      { id: "p1", phase: "focus", completed: true, taskId: A },
      { id: "p1", phase: "focus", completed: true, taskId: A },
    ]);
    expect(merged).toEqual({ [A]: 1 });
  });
});
