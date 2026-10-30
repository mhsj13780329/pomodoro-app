import { describe, expect, it } from "vitest";
import { applyTimerAction, type PhaseSettings, type TransitionTimer } from "./transitions";

const settings: PhaseSettings = {
  focusSec: 25 * 60,
  shortBreakSec: 5 * 60,
  longBreakSec: 15 * 60,
  longBreakEvery: 4,
  autoStartFocus: false,
  autoStartShortBreak: true,
  autoStartLongBreak: true,
};

function timer(partial: Partial<TransitionTimer> = {}): TransitionTimer {
  return {
    phase: "focus",
    status: "idle",
    startedAt: null,
    plannedSec: 25 * 60,
    pausedAt: null,
    pausedTotalSec: 0,
    cycleIndex: 0,
    runId: "run-0",
    version: 0,
    taskId: null,
    ...partial,
  };
}

describe("timer transitions", () => {
  it("starts a phase with the given run id and does not start twice", () => {
    const step = applyTimerAction(timer(), settings, { type: "start", runId: "run-1" }, 1_000);
    expect(step.changed).toBe(true);
    expect(step.timer).toMatchObject({
      status: "running",
      startedAt: 1_000,
      runId: "run-1",
      version: 1,
      plannedSec: 25 * 60,
    });
    expect(step.session).toBeNull();
    const again = applyTimerAction(step.timer, settings, { type: "start", runId: "run-2" }, 2_000);
    expect(again.changed).toBe(false);
    expect(again.timer).toBe(step.timer);
  });

  it("pauses and resumes without moving the start timestamp", () => {
    const running = applyTimerAction(timer(), settings, { type: "start", runId: "run-1" }, 1_000).timer;
    const paused = applyTimerAction(running, settings, { type: "pause" }, 11_000);
    expect(paused.timer).toMatchObject({ status: "paused", pausedAt: 11_000, startedAt: 1_000, version: 2 });
    const resumed = applyTimerAction(paused.timer, settings, { type: "resume" }, 21_000);
    expect(resumed.timer.pausedTotalSec).toBe(10);
    expect(resumed.timer.startedAt).toBe(1_000);
    expect(resumed.timer.pausedAt).toBeNull();
  });

  it("does not rewrite an in-progress length when settings change", () => {
    const running = applyTimerAction(timer(), settings, { type: "start", runId: "run-1" }, 0).timer;
    const longer = { ...settings, focusSec: 50 * 60 };
    const paused = applyTimerAction(running, longer, { type: "pause" }, 5_000);
    expect(paused.timer.plannedSec).toBe(25 * 60);
  });

  it("skips a focus without counting it", () => {
    const running = timer({ status: "running", startedAt: 0, cycleIndex: 3, version: 2 });
    const step = applyTimerAction(running, settings, { type: "skip" }, 5_000);
    expect(step.timer).toMatchObject({
      phase: "shortBreak",
      status: "idle",
      cycleIndex: 3,
      plannedSec: 5 * 60,
      version: 3,
    });
    expect(step.session).toBeNull();
  });

  it("opens a long break on the fourth finished focus", () => {
    const running = timer({
      status: "running",
      startedAt: 0,
      cycleIndex: 3,
      runId: "focus-4",
      taskId: "task-1",
      version: 4,
    });
    const step = applyTimerAction(running, settings, { type: "complete", nextRunId: "long-1" }, 25 * 60 * 1000);
    expect(step.session).toMatchObject({
      id: "focus-4",
      phase: "focus",
      taskId: "task-1",
      durationSec: 25 * 60,
      completed: true,
    });
    expect(step.timer).toMatchObject({
      phase: "longBreak",
      status: "running",
      cycleIndex: 4,
      runId: "long-1",
      startedAt: 25 * 60 * 1000,
      plannedSec: 15 * 60,
      taskId: "task-1",
    });
  });

  it("leaves the next phase idle when its auto-start is off", () => {
    const running = timer({ status: "running", startedAt: 0, runId: "focus-1" });
    const manual = { ...settings, autoStartShortBreak: false };
    const step = applyTimerAction(running, manual, { type: "complete", nextRunId: "unused" }, 30 * 60 * 1000);
    expect(step.session?.id).toBe("focus-1");
    expect(step.timer).toMatchObject({
      phase: "shortBreak",
      status: "idle",
      cycleIndex: 1,
      startedAt: null,
      plannedSec: 5 * 60,
      runId: "focus-1",
    });
  });

  it("does not write a session when a break ends", () => {
    const running = timer({
      phase: "shortBreak",
      status: "running",
      startedAt: 0,
      plannedSec: 5 * 60,
      cycleIndex: 1,
      runId: "break-1",
    });
    const step = applyTimerAction(
      running,
      { ...settings, autoStartFocus: true },
      { type: "complete", nextRunId: "focus-2" },
      5 * 60 * 1000,
    );
    expect(step.session).toBeNull();
    expect(step.timer).toMatchObject({ phase: "focus", status: "running", runId: "focus-2", cycleIndex: 1 });
  });

  it("starts the next phase at now, not at the old end, after a long gap", () => {
    const running = timer({ status: "running", startedAt: 0, runId: "focus-1" });
    const later = 2 * 60 * 60 * 1000;
    const step = applyTimerAction(running, settings, { type: "complete", nextRunId: "break-1" }, later);
    expect(step.timer.startedAt).toBe(later);
    expect(step.timer.plannedSec).toBe(5 * 60);
    expect(step.session?.endedAt).toBe(25 * 60 * 1000);
  });

  it("resets in place and selects another phase without a session", () => {
    const running = timer({ status: "running", startedAt: 0, cycleIndex: 2, version: 1 });
    const reset = applyTimerAction(running, settings, { type: "reset" }, 4_000);
    expect(reset.timer).toMatchObject({ status: "idle", phase: "focus", cycleIndex: 2, startedAt: null });
    expect(reset.session).toBeNull();
    const selected = applyTimerAction(reset.timer, settings, { type: "select", phase: "longBreak" }, 5_000);
    expect(selected.timer).toMatchObject({ phase: "longBreak", status: "idle", plannedSec: 15 * 60, cycleIndex: 2 });
    const same = applyTimerAction(selected.timer, settings, { type: "select", phase: "longBreak" }, 6_000);
    expect(same.changed).toBe(false);
    expect(same.timer).toBe(selected.timer);
  });
});
