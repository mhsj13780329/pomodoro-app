import { describe, expect, it } from "vitest";
import { addCivilDays, civilKey } from "./calendar";
import {
  dailyAverageSec,
  foldStats,
  groupByBucket,
  groupByLocalDate,
  heatLevel,
  isCountedFocus,
  mergeById,
  streaks,
  type StatSession,
} from "./aggregate";

const TEHRAN = "Asia/Tehran";
const NEW_YORK = "America/New_York";

function session(partial: Partial<StatSession> & Pick<StatSession, "id" | "endedAt">): StatSession {
  return {
    startedAt: partial.endedAt - 25 * 60_000,
    durationSec: 25 * 60,
    phase: "focus",
    completed: true,
    taskId: null,
    ...partial,
  };
}

/** Noon UTC on a Gregorian day, which is still that day in both Tehran and New York. */
function noon(key: string): number {
  return Date.parse(`${key}T12:00:00.000Z`);
}

describe("grouping by local date", () => {
  it("buckets by the zone, including a daylight-saving zone", () => {
    const rows = [
      session({ id: "a", endedAt: Date.parse("2026-03-08T04:30:00.000Z") }),
      session({ id: "b", endedAt: Date.parse("2026-03-08T06:30:00.000Z") }),
    ];
    // 04:30Z is 23:30 on 7 Mar in New York. 06:30Z is 01:30 EST on 8 Mar, still before the spring-forward.
    const days = groupByLocalDate(rows, NEW_YORK);
    expect(days.get("2026-03-07")?.sessions).toBe(1);
    expect(days.get("2026-03-08")?.sessions).toBe(1);
    expect(groupByLocalDate(rows, TEHRAN).get("2026-03-08")?.sessions).toBe(2);
  });

  it("counts a session that crosses midnight entirely on the day it ended", () => {
    const row = session({
      id: "cross",
      startedAt: Date.parse("2026-10-30T20:00:00.000Z"),
      endedAt: Date.parse("2026-10-30T20:40:00.000Z"),
      durationSec: 40 * 60,
    });
    // 20:00Z is 23:30 on 30 Oct in Tehran. 20:40Z is 00:10 on 31 Oct.
    const days = groupByLocalDate([row], TEHRAN);
    expect([...days.keys()]).toEqual(["2026-10-31"]);
    expect(days.get("2026-10-31")).toMatchObject({ focusSec: 40 * 60, sessions: 1 });
  });

  it("ignores breaks, unfinished focus, and a repeated id", () => {
    const rows = [
      session({ id: "1", endedAt: noon("2026-10-30"), phase: "shortBreak" }),
      session({ id: "2", endedAt: noon("2026-10-30"), completed: false }),
      session({ id: "3", endedAt: noon("2026-10-30"), phase: "FOCUS" }),
      session({ id: "3", endedAt: noon("2026-10-30"), phase: "FOCUS", durationSec: 50 * 60 }),
    ];
    expect(isCountedFocus(rows[0]!)).toBe(false);
    const day = groupByLocalDate(rows, TEHRAN).get("2026-10-30");
    expect(day).toMatchObject({ sessions: 1, focusSec: 25 * 60 });
  });
});

describe("streaks", () => {
  const today = "2026-10-30";
  const day = (delta: number) => civilKey(addCivilDays({ year: 2026, month: 10, day: 30 }, delta));

  it("stays alive through today when yesterday counted and today is still empty", () => {
    const result = streaks([day(-2), day(-1)], today);
    expect(result.current).toBe(2);
    expect(result.currentDates).toEqual([day(-2), day(-1)]);
  });

  it("breaks after a full local day with no session", () => {
    expect(streaks([day(-3), day(-2)], today).current).toBe(0);
    expect(streaks([day(-1), today], today).current).toBe(2);
  });

  it("keeps the longest run as the best, including a run that is not current", () => {
    const past = [-20, -19, -18, -17, -16].map(day);
    const result = streaks([...past, day(-1)], today);
    expect(result.current).toBe(1);
    expect(result.best).toBe(5);
  });

  it("is zero when nothing has ever counted", () => {
    expect(streaks([], today)).toEqual({ current: 0, best: 0, currentDates: [] });
  });
});

describe("heat levels", () => {
  it("uses fixed minute thresholds", () => {
    expect(heatLevel(0)).toBe(0);
    expect(heatLevel(24 * 60)).toBe(1);
    expect(heatLevel(25 * 60)).toBe(2);
    expect(heatLevel(49 * 60)).toBe(2);
    expect(heatLevel(50 * 60)).toBe(3);
    expect(heatLevel(99 * 60)).toBe(3);
    expect(heatLevel(100 * 60)).toBe(4);
  });
});

describe("merging pending sessions", () => {
  it("counts a queued session once, even when the server already has that id", () => {
    const server = [session({ id: "same", endedAt: noon("2026-10-30") })];
    const pending = [session({ id: "same", endedAt: noon("2026-10-30") }), session({ id: "new", endedAt: noon("2026-10-30") })];
    const folded = foldStats({
      serverSessions: server,
      pending,
      streakDatesBeforeRange: [],
      serverBest: 4,
      today: "2026-10-30",
      timeZone: TEHRAN,
    });
    expect(folded.sessions.map((row) => row.id)).toEqual(["same", "new"]);
    expect(folded.byDay.get("2026-10-30")).toMatchObject({ sessions: 2, focusSec: 50 * 60 });
    expect(folded.currentStreak).toBe(1);
    expect(folded.bestStreak).toBe(4);
  });

  it("extends the current streak with a session that is still only on this device", () => {
    const yesterday = "2026-10-29";
    const folded = foldStats({
      serverSessions: [],
      pending: [session({ id: "offline", endedAt: noon("2026-10-30") })],
      streakDatesBeforeRange: [yesterday],
      serverBest: 1,
      today: "2026-10-30",
      timeZone: TEHRAN,
    });
    expect(folded.currentStreak).toBe(2);
    expect(folded.bestStreak).toBe(2);
  });

  it("does not let the server row and the queue add the same session twice in a bucket", () => {
    const rows = mergeById(
      [session({ id: "1", endedAt: noon("2026-10-30"), taskId: "task-a" })],
      [session({ id: "1", endedAt: noon("2026-10-30"), taskId: "task-a" })],
    );
    expect(groupByBucket(rows, (row) => row.taskId ?? null)).toEqual([
      { id: "task-a", focusSec: 25 * 60, sessions: 1 },
    ]);
  });
});

describe("daily average", () => {
  it("divides by days through today, not by future days in the range", () => {
    const average = dailyAverageSec(100 * 60, "2026-10-01", "2026-10-31", "2026-10-30");
    expect(average).toBe((100 * 60) / 30);
  });
});
