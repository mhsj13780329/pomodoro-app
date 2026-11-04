import { describe, expect, it } from "vitest";
import { catchUp } from "./catch-up";
import { remainingMs } from "./remaining";
import type { PhaseSettings, TransitionTimer } from "./transitions";

const MIN = 60 * 1000;

const baseSettings: PhaseSettings = {
  focusSec: 25 * 60,
  shortBreakSec: 5 * 60,
  longBreakSec: 15 * 60,
  longBreakEvery: 4,
  autoStartFocus: false,
  autoStartShortBreak: true,
  autoStartLongBreak: true,
};

function settings(partial: Partial<PhaseSettings> = {}): PhaseSettings {
  return { ...baseSettings, ...partial };
}

function running(partial: Partial<TransitionTimer> = {}): TransitionTimer {
  return {
    phase: "focus",
    status: "running",
    startedAt: 0,
    plannedSec: 25 * 60,
    pausedAt: null,
    pausedTotalSec: 0,
    cycleIndex: 0,
    runId: "run-1",
    version: 7,
    taskId: "task-1",
    ...partial,
  };
}

function counter() {
  let n = 0;
  return () => `id-${++n}`;
}

const allOn = { autoStartFocus: true, autoStartShortBreak: true, autoStartLongBreak: true };
const noLong = { autoStartFocus: true, autoStartShortBreak: true, autoStartLongBreak: false };

describe("catchUp phase advance", () => {
  it("starts the short break when the focus ended, not when we look", () => {
    const now = 26 * MIN;
    const result = catchUp(running(), settings(), now, counter());
    const next = result.timer;
    expect(result.ended).toBe(true);
    expect(next.phase).toBe("shortBreak");
    expect(next.status).toBe("running");
    expect(next.startedAt).toBe(25 * MIN);
    expect(next.cycleIndex).toBe(1);
    expect(remainingMs(next, now)).toBe(4 * MIN);
  });

  it("leaves the next phase idle when its auto-start is off", () => {
    const now = 600 * MIN;
    const next = catchUp(running(), settings({ autoStartShortBreak: false }), now, counter()).timer;
    expect(next.phase).toBe("shortBreak");
    expect(next.status).toBe("idle");
    expect(next.plannedSec).toBe(5 * 60);
    expect(next.cycleIndex).toBe(1);
    expect(remainingMs(next, now)).toBe(5 * MIN);
  });

  it("opens the long break on the Nth finished focus and then a new cycle", () => {
    const s = settings(allOn);
    const start = running();
    const fourthEnds = (4 * 25 + 3 * 5) * MIN;
    const long = catchUp(start, s, fourthEnds, counter());
    expect(long.ended).toBe(true);
    expect(long.timer.phase).toBe("longBreak");
    expect(long.timer.status).toBe("running");
    expect(long.timer.cycleIndex).toBe(4);
    expect(long.timer.startedAt).toBe(fourthEnds);

    const cycleEnds = fourthEnds + 15 * MIN;
    const again = catchUp(start, s, cycleEnds, counter()).timer;
    expect(again.phase).toBe("focus");
    expect(again.cycleIndex).toBe(0);
    expect(again.startedAt).toBe(cycleEnds);
    expect(remainingMs(again, cycleEnds)).toBe(25 * MIN);
  });

  it("stops at a long break whose auto-start is off, even after a long gap", () => {
    const after = (4 * 25 + 3 * 5) * MIN + 10 * MIN;
    const next = catchUp(running(), settings(noLong), after, counter()).timer;
    expect(next.phase).toBe("longBreak");
    expect(next.status).toBe("idle");
    expect(next.cycleIndex).toBe(4);
    expect(remainingMs(next, after)).toBe(15 * MIN);
  });

  it("does not move a paused timer", () => {
    const paused = running({ status: "paused", pausedAt: 5_000 });
    const later = catchUp(paused, settings(), 5 * 60 * MIN, counter());
    expect(later.ended).toBe(false);
    expect(later.timer).toBe(paused);
    expect(later.sessions).toEqual([]);
  });

  it("returns the same object for idle, still running, bad plannedSec or bad interval", () => {
    const idle = running({ status: "idle", startedAt: null });
    expect(catchUp(idle, settings(), 99 * MIN, counter()).timer).toBe(idle);
    const live = running();
    const notYet = catchUp(live, settings(), 24 * MIN, counter());
    expect(notYet).toEqual({ timer: live, sessions: [], ended: false });
    expect(notYet.timer).toBe(live);
    const zero = running({ plannedSec: 0 });
    expect(catchUp(zero, settings(), 99 * MIN, counter()).ended).toBe(false);
    const result = catchUp(live, settings({ longBreakEvery: 0 }), 99 * MIN, counter());
    expect(result.timer).toBe(live);
    expect(result.ended).toBe(false);
  });

  it("is stable when applied twice at the same instant", () => {
    const now = 30 * MIN;
    const once = catchUp(running(), settings(), now, counter());
    const twice = catchUp(once.timer, settings(), now, counter());
    expect(once.ended).toBe(true);
    expect(twice.ended).toBe(false);
    expect(twice.timer).toBe(once.timer);
    expect(twice.sessions).toEqual([]);
  });

  it("lands inside a long focus/short run without walking every phase", () => {
    const s = settings({
      focusSec: 1,
      shortBreakSec: 1,
      longBreakSec: 1,
      longBreakEvery: 2_000_000,
      ...noLong,
    });
    const start = running({ plannedSec: 1 });
    const result = catchUp(start, s, 5_000, counter());
    expect(result.timer.phase).toBe("shortBreak");
    expect(result.timer.cycleIndex).toBe(3);
    expect(result.timer.status).toBe("running");
    expect(remainingMs(result.timer, 5_000)).toBe(1_000);
    expect(result.sessions).toHaveLength(3);
  }, 1_000);

  it("projects a long open cycle in one step", () => {
    const s = settings({ focusSec: 0.001, shortBreakSec: 0.001, longBreakSec: 0.001, ...allOn });
    const result = catchUp(running({ plannedSec: 0.001 }), s, 10_000_000, counter());
    expect(result.ended).toBe(true);
    expect(result.timer.status).toBe("running");
    expect(remainingMs(result.timer, 10_000_000)).toBeGreaterThanOrEqual(0);
  }, 1_000);

  it("carries runId, version and taskId through unchanged", () => {
    const result = catchUp(running({ cycleIndex: 1 }), settings(allOn), 100 * MIN, counter());
    expect(result.timer.runId).toBe("run-1");
    expect(result.timer.version).toBe(7);
    expect(result.timer.taskId).toBe("task-1");
  });
});

describe("catchUp sessions", () => {
  it("a focus that ended gives one session with exact start and end, including pause time", () => {
    const timer = running({ startedAt: 1_000, pausedTotalSec: 90, plannedSec: 25 * 60 });
    const end = 1_000 + 90_000 + 25 * MIN;
    const result = catchUp(timer, settings(), end + 5_000, counter());
    expect(result.sessions).toEqual([
      {
        id: "id-1",
        phase: "focus",
        startedAt: 1_000,
        endedAt: end,
        durationSec: 25 * 60,
        completed: true,
        taskId: "task-1",
      },
    ]);
  });

  it("a break that ended gives no session", () => {
    const timer = running({ phase: "shortBreak", plannedSec: 5 * 60, cycleIndex: 1 });
    const result = catchUp(timer, settings(), 6 * MIN, counter());
    expect(result.ended).toBe(true);
    expect(result.timer.phase).toBe("focus");
    expect(result.sessions).toEqual([]);
  });

  it("lists several focuses with open auto-start, oldest first", () => {
    const s = settings(allOn);
    // Focus 25, short 5 x3, long 15. One cycle = 130 min. Focus ends at 25, 55, 85, 115.
    // At 300 min: cycle 2 starts at 260; its first focus ends at 285 and the second is running.
    const now = 300 * MIN;
    const result = catchUp(running(), s, now, counter());
    const ends = [25, 55, 85, 115, 155, 185, 215, 245, 285].map((m) => m * MIN);
    expect(result.sessions.map((x) => x.endedAt)).toEqual(ends);
    expect(result.sessions.map((x) => x.startedAt)).toEqual(ends.map((e) => e - 25 * MIN));
    expect(result.sessions.every((x) => x.durationSec === 1500)).toBe(true);
    // The 285 focus is followed by a short break (285-290), then focus 290-315 is running.
    expect(result.timer.phase).toBe("focus");
    expect(result.timer.startedAt).toBe(290 * MIN);
    expect(result.timer.cycleIndex).toBe(1);
  });

  it("starting from a mid-cycle break, the open path counts focuses after it", () => {
    const s = settings(allOn);
    const timer = running({ phase: "shortBreak", plannedSec: 5 * 60, cycleIndex: 2 });
    // Short ends at 5. Focus 5-30, short 30-35, focus 35-60.
    const result = catchUp(timer, s, 61 * MIN, counter());
    expect(result.sessions.map((x) => [x.startedAt, x.endedAt])).toEqual([
      [5 * MIN, 30 * MIN],
      [35 * MIN, 60 * MIN],
    ]);
  });

  it("the run before the long break counts its focuses", () => {
    const s = settings(noLong);
    const ends = [25, 55, 85, 115].map((m) => m * MIN);
    const mid = catchUp(running(), s, 100 * MIN, counter());
    expect(mid.timer.phase).toBe("focus");
    expect(mid.timer.startedAt).toBe(90 * MIN);
    expect(mid.timer.cycleIndex).toBe(3);
    expect(mid.sessions.map((x) => x.endedAt)).toEqual(ends.slice(0, 3));

    const after = catchUp(running(), s, 500 * MIN, counter());
    expect(after.timer.phase).toBe("longBreak");
    expect(after.timer.status).toBe("idle");
    expect(after.sessions.map((x) => x.endedAt)).toEqual(ends);
    expect(after.sessions.map((x) => x.startedAt)).toEqual(ends.map((e) => e - 25 * MIN));
  });

  it("the run before the long break from a break counts only later focuses", () => {
    const s = settings(noLong);
    const timer = running({ phase: "shortBreak", plannedSec: 5 * 60, cycleIndex: 2 });
    const during = catchUp(timer, s, 3 * MIN, counter());
    expect(during.ended).toBe(false);
    const result = catchUp(timer, s, 500 * MIN, counter());
    // Short ends 5; focus 5-30, short, focus 35-60 = the 4th. Then the long break waits.
    expect(result.sessions.map((x) => x.endedAt)).toEqual([30 * MIN, 60 * MIN]);
    expect(result.timer.phase).toBe("longBreak");
  });

  it("stops at a blocked phase and counts only the focuses before it", () => {
    // Short break auto-start off: focus 0-25 ends, short waits. One session.
    const a = catchUp(running(), settings({ autoStartShortBreak: false }), 900 * MIN, counter());
    expect(a.sessions).toHaveLength(1);
    expect(a.timer.status).toBe("idle");

    // Focus auto-start off: from a short break, the next focus waits. No session.
    const timer = running({ phase: "shortBreak", plannedSec: 5 * 60, cycleIndex: 1 });
    const b = catchUp(timer, settings(), 900 * MIN, counter());
    expect(b.sessions).toEqual([]);
    expect(b.timer.phase).toBe("focus");
    expect(b.timer.status).toBe("idle");

    // Long break off with short breaks off: focus, then short waits.
    const c = catchUp(running(), settings({ ...noLong, autoStartShortBreak: false }), 900 * MIN, counter());
    expect(c.sessions).toHaveLength(1);
  });

  it("caps a long sleep at maxSessions, keeps the newest, and stays fast", () => {
    const base = { focusSec: 1, shortBreakSec: 1, longBreakSec: 1 };
    const week = 7 * 24 * 3600 * 1000;
    const cases: Partial<PhaseSettings>[] = [{ ...base, ...allOn }, { ...base, ...noLong, longBreakEvery: 50_000_000 }];
    for (const extra of cases) {
      const s = settings(extra);
      const t0 = performance.now();
      const result = catchUp(running({ plannedSec: 1 }), s, week, counter(), 200);
      const elapsed = performance.now() - t0;
      expect(elapsed).toBeLessThan(50);
      expect(result.sessions).toHaveLength(200);
      expect(result.sessions[0]!.id).toBe("id-1");
      const last = result.sessions[199]!;
      // Every session is 1s long and oldest-first.
      expect(last.endedAt - last.startedAt).toBe(1_000);
      for (let i = 1; i < 200; i += 1) {
        expect(result.sessions[i]!.startedAt).toBeGreaterThan(result.sessions[i - 1]!.startedAt);
      }
      // The newest focus ended no later than now, and within one cycle of it.
      expect(last.endedAt).toBeLessThanOrEqual(week);
      expect(week - last.endedAt).toBeLessThanOrEqual(3_000);
    }
  });

  it("keeps exactly the newest when capped", () => {
    const s = settings({ ...allOn, focusSec: 60, shortBreakSec: 60, longBreakSec: 60, longBreakEvery: 2 });
    // Cycle: focus 0-1, short 1-2, focus 2-3, long 3-4 (min). Focus ends at 1, 3, 5, 7 ...
    const timer = running({ plannedSec: 60 });
    const all = catchUp(timer, s, 40 * MIN, counter(), 1000).sessions;
    const capped = catchUp(timer, s, 40 * MIN, counter(), 5).sessions;
    expect(all).toHaveLength(20);
    expect(capped.map((x) => x.endedAt)).toEqual(all.slice(-5).map((x) => x.endedAt));
    expect(catchUp(timer, s, 40 * MIN, counter(), 0).sessions).toEqual([]);
  });

  it("takes ids from newId in order, and only for kept sessions", () => {
    const s = settings(allOn);
    const calls: string[] = [];
    let n = 0;
    const newId = () => {
      const id = `x${++n}`;
      calls.push(id);
      return id;
    };
    const result = catchUp(running(), s, 300 * MIN, newId);
    expect(result.sessions.map((x) => x.id)).toEqual(result.sessions.map((_, i) => `x${i + 1}`));
    expect(calls).toHaveLength(result.sessions.length);
    n = 0;
    calls.length = 0;
    catchUp(running(), s, 300 * MIN, newId, 3);
    expect(calls).toEqual(["x1", "x2", "x3"]);
  });

  it("is idempotent for sessions with the same now", () => {
    for (const s of [settings(allOn), settings(noLong), settings()]) {
      const once = catchUp(running(), s, 400 * MIN, counter());
      const twice = catchUp(once.timer, s, 400 * MIN, counter());
      expect(twice.sessions).toEqual([]);
      expect(twice.ended).toBe(false);
      expect(twice.timer).toBe(once.timer);
    }
  });

  it("agrees with a phase-by-phase walk on the open path", () => {
    const s = settings({ ...allOn, focusSec: 7, shortBreakSec: 3, longBreakSec: 5, longBreakEvery: 3 });
    const timer = running({ plannedSec: 7, cycleIndex: 0 });
    // Hand walk: cycle = 3*7 + 2*3 + 5 = 32s. Focus ends at 7, 17, 27, then 39, 49, 59 ...
    const result = catchUp(timer, s, 70_000, counter());
    expect(result.sessions.map((x) => x.endedAt / 1000)).toEqual([7, 17, 27, 39, 49, 59, 71].slice(0, 6));
    expect(result.timer.phase).toBe("focus");
    expect(result.timer.startedAt).toBe(64_000 + 0);
  });
});
