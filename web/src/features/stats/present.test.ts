import { describe, expect, it } from "vitest";
import { presentFocus } from "./present";
import type { StatSession } from "@/lib/stats/aggregate";
import type { StatsResponse } from "@/lib/stats/contract";

const TEHRAN = "Asia/Tehran";
// 12:00 UTC is 15:30 in Tehran, still 30 Oct.
const NOW = Date.parse("2026-10-30T12:00:00.000Z");

function session(id: string, day: string): StatSession {
  return {
    id,
    startedAt: Date.parse(`${day}T08:00:00.000Z`),
    endedAt: Date.parse(`${day}T08:25:00.000Z`),
    durationSec: 25 * 60,
    phase: "focus",
    completed: true,
    taskId: null,
  };
}

const snapshot: StatsResponse = {
  timezone: TEHRAN,
  pro: false,
  today: "2026-10-30",
  from: "2026-10-01",
  to: "2026-10-30",
  sessions: [
    {
      id: "server",
      startedAt: "2026-10-29T08:00:00.000Z",
      endedAt: "2026-10-29T08:25:00.000Z",
      durationSec: 25 * 60,
      taskId: null,
      projectId: null,
    },
  ],
  currentStreak: 1,
  bestStreak: 3,
  streakDatesBeforeRange: [],
};

describe("presentFocus", () => {
  it("counts a guest's local sessions without a server snapshot", () => {
    const view = presentFocus({
      signedIn: false,
      sessionPending: false,
      timeZone: TEHRAN,
      now: NOW,
      snapshot: null,
      offline: false,
      pending: [],
      handedOff: [],
      guestSessions: [session("g", "2026-10-30")],
    });
    expect(view.status).toBe("ready");
    expect(view.todaySessions).toBe(1);
    expect(view.todayFocusSec).toBe(25 * 60);
    expect(view.currentStreak).toBe(1);
  });

  it("adds a queued session on top of the server day without counting the server row twice", () => {
    const view = presentFocus({
      signedIn: true,
      sessionPending: false,
      timeZone: TEHRAN,
      now: NOW,
      snapshot,
      offline: false,
      pending: [session("server", "2026-10-29"), session("local", "2026-10-30")],
      handedOff: [],
      guestSessions: [],
    });
    expect(view.todaySessions).toBe(1);
    expect(view.currentStreak).toBe(2);
    expect(view.bestStreak).toBe(3);
    expect(view.sessions).toHaveLength(2);
  });

  it("does not show zeros while the signed-in history is still loading", () => {
    const view = presentFocus({
      signedIn: true,
      sessionPending: false,
      timeZone: TEHRAN,
      now: NOW,
      snapshot: null,
      offline: false,
      pending: [],
      handedOff: [],
      guestSessions: [],
    });
    expect(view.status).toBe("loading");
  });
});
