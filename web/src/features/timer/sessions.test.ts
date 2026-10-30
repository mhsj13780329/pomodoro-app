import { describe, expect, it } from "vitest";
import { defaultTimer, type TimerCore } from "./logic";
import { finishedFocusSession } from "./sessions";

function runningFocus(partial: Partial<TimerCore> = {}): TimerCore {
  return {
    ...defaultTimer,
    phase: "focus",
    status: "running",
    startedAt: 1_000,
    plannedSec: 25 * 60,
    pausedTotalSec: 0,
    ...partial,
  };
}

describe("finishedFocusSession", () => {
  it("records a focus that ran to the end", () => {
    const session = finishedFocusSession(runningFocus(), "id-1");
    expect(session).toEqual({
      id: "id-1",
      phase: "focus",
      startedAt: 1_000,
      endedAt: 1_000 + 25 * 60 * 1000,
      durationSec: 25 * 60,
      completed: true,
      taskId: null,
    });
  });

  it("credits the focus to the task that was selected", () => {
    expect(finishedFocusSession(runningFocus(), "id-3", "task-1")?.taskId).toBe("task-1");
  });

  it("adds time already spent paused", () => {
    const session = finishedFocusSession(runningFocus({ pausedTotalSec: 12 }), "id-2");
    expect(session?.endedAt).toBe(1_000 + 12_000 + 25 * 60 * 1000);
  });

  it("ignores breaks, idle, and skip-shaped state", () => {
    expect(finishedFocusSession(runningFocus({ phase: "shortBreak" }), "x")).toBeNull();
    expect(finishedFocusSession(runningFocus({ status: "idle", startedAt: null }), "x")).toBeNull();
    expect(finishedFocusSession(runningFocus({ status: "paused" }), "x")).toBeNull();
  });
});
