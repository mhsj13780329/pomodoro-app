// Server read for the stats page. Numbers are not stored: we load the sessions
// and hand them to the same functions the browser uses.
import "server-only";

import { prisma } from "@/lib/prisma";
import { isProActive, ProRequiredError, requirePro, type Entitlement } from "@/lib/pro";
import { isLocale, type Locale } from "@/i18n/routing";
import {
  addCivilDays,
  calendarForLocale,
  civilDate,
  civilKey,
  civilToday,
  localMidnight,
  parseCivil,
  startOfCalendarMonth,
  validTimeZone,
} from "./calendar";
import { groupByBucket, streaks, type StatSession } from "./aggregate";
import type { StatsBreakdownRow, StatsResponse, StatsSession } from "./contract";
import { decideRange } from "./range";

export type StatsQuery = {
  from: string;
  to: string;
  breakdown: boolean;
  /** Page locale. It picks Jalali vs Gregorian for "this month". The zone still comes from the user row. */
  locale: string | null;
  /** Export is always Pro, even for a range a free account could view. */
  export: boolean;
  now: number;
};

export type LoadedSession = {
  id: string;
  startedAt: Date;
  endedAt: Date;
  durationSec: number;
  taskId: string | null;
  projectId: string | null;
  taskTitle: string | null;
  taskDeleted: boolean;
  projectName: string | null;
  projectDeleted: boolean;
};

export type StatsRead =
  | { ok: false; status: 400 | 403; error: "invalid" | "pro_required" }
  | {
      ok: true;
      timezone: string;
      locale: Locale;
      pro: boolean;
      today: string;
      from: string;
      to: string;
      sessions: LoadedSession[];
      currentStreak: number;
      bestStreak: number;
      streakDatesBeforeRange: string[];
    };

function toWire(session: LoadedSession): StatsSession {
  return {
    id: session.id,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt.toISOString(),
    durationSec: session.durationSec,
    taskId: session.taskId,
    projectId: session.projectId,
  };
}

function toStat(session: LoadedSession): StatSession {
  return {
    id: session.id,
    startedAt: session.startedAt.getTime(),
    endedAt: session.endedAt.getTime(),
    durationSec: session.durationSec,
    phase: "focus",
    completed: true,
    taskId: session.taskId,
    projectId: session.projectId,
  };
}

function breakdownRows(
  sessions: readonly LoadedSession[],
  kind: "task" | "project",
): StatsBreakdownRow[] {
  const stats = sessions.map(toStat);
  const buckets = groupByBucket(stats, (session) => (kind === "task" ? session.taskId ?? null : session.projectId ?? null));
  return buckets.map((bucket) => {
    const sample = sessions.find((session) =>
      kind === "task" ? (session.taskId ?? null) === bucket.id : (session.projectId ?? null) === bucket.id,
    );
    if (kind === "task") {
      return {
        id: bucket.id,
        name: sample?.taskTitle ?? null,
        deleted: sample?.taskDeleted ?? false,
        focusSec: bucket.focusSec,
        sessions: bucket.sessions,
      };
    }
    return {
      id: bucket.id,
      name: sample?.projectName ?? null,
      deleted: sample?.projectDeleted ?? false,
      focusSec: bucket.focusSec,
      sessions: bucket.sessions,
    };
  });
}

export function toStatsResponse(read: Extract<StatsRead, { ok: true }>, breakdown: boolean): StatsResponse {
  const body: StatsResponse = {
    timezone: read.timezone,
    pro: read.pro,
    today: read.today,
    from: read.from,
    to: read.to,
    sessions: read.sessions.map(toWire),
    currentStreak: read.currentStreak,
    bestStreak: read.bestStreak,
    streakDatesBeforeRange: read.streakDatesBeforeRange,
  };
  if (breakdown) {
    body.tasks = breakdownRows(read.sessions, "task");
    body.projects = breakdownRows(read.sessions, "project");
  }
  return body;
}

/**
 * Loads one user's sessions for a local-date range.
 * `endedAt` is a timestamp without a time zone. Prisma stores UTC in it, so the
 * bounds are the UTC instants of local midnight. Grouping then uses the shared
 * calendar, not a second SQL expression.
 */
export async function readStats(userId: string, query: StatsQuery): Promise<StatsRead> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true, locale: true, proUntil: true, proLifetime: true },
  });
  const entitlement: Entitlement = {
    proUntil: user?.proUntil ?? null,
    proLifetime: user?.proLifetime ?? false,
  };
  const timezone = validTimeZone(user?.timezone);
  const requested = query.locale ?? undefined;
  const storedLocale = user?.locale;
  const locale: Locale = isLocale(requested) ? requested : isLocale(storedLocale) ? storedLocale : "fa";
  const now = new Date(query.now);
  const today = civilToday(now, timezone);
  // "This month" follows the page language: Jalali on /fa, Gregorian everywhere else.
  const monthStart = civilKey(startOfCalendarMonth(now, timezone, calendarForLocale(locale)));
  const pro = isProActive(entitlement, query.now);

  const asFree = decideRange({
    from: query.from,
    to: query.to,
    today,
    monthStart,
    breakdown: query.breakdown,
    export: query.export,
    pro: false,
  });
  if (!asFree.ok && asFree.reason === "invalid") return { ok: false, status: 400, error: "invalid" };
  if (!asFree.ok) {
    // The free window, a breakdown and an export are refused here, not by hiding a button.
    try {
      requirePro(entitlement, query.now);
    } catch (error) {
      if (error instanceof ProRequiredError) return { ok: false, status: 403, error: "pro_required" };
      throw error;
    }
  }

  const allowed = asFree.ok
    ? asFree
    : decideRange({
        from: query.from,
        to: query.to,
        today,
        monthStart,
        breakdown: query.breakdown,
        export: query.export,
        pro: true,
      });
  if (!allowed.ok) return { ok: false, status: 400, error: "invalid" };

  const fromDate = parseCivil(allowed.from);
  const toDate = parseCivil(allowed.to);
  if (!fromDate || !toDate) return { ok: false, status: 400, error: "invalid" };
  // `to` is inclusive, so the query runs up to the next local midnight.
  const rangeStart = localMidnight(fromDate, timezone);
  const rangeEnd = localMidnight(addCivilDays(toDate, 1), timezone);

  // The range uses the (userId, endedAt) index. The streak needs every counted
  // day, but only the timestamps: the response still does not include that history.
  const [rows, history] = await Promise.all([
    prisma.focusSession.findMany({
      where: {
        userId,
        phase: "FOCUS",
        completed: true,
        endedAt: { gte: rangeStart, lt: rangeEnd },
      },
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        durationSec: true,
        taskId: true,
        task: {
          select: {
            title: true,
            deletedAt: true,
            projectId: true,
            project: { select: { name: true, deletedAt: true } },
          },
        },
      },
      orderBy: { endedAt: "asc" },
    }),
    prisma.focusSession.findMany({
      where: { userId, phase: "FOCUS", completed: true },
      select: { endedAt: true },
    }),
  ]);

  const sessions: LoadedSession[] = rows.map((row) => ({
    id: row.id,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationSec: row.durationSec,
    taskId: row.taskId,
    projectId: row.task?.projectId ?? null,
    taskTitle: row.task?.title ?? null,
    taskDeleted: row.task?.deletedAt != null,
    projectName: row.task?.project?.name ?? null,
    projectDeleted: row.task?.project?.deletedAt != null,
  }));

  const countedDays = history.map((row) => civilKey(civilDate(row.endedAt, timezone)));
  const streak = streaks(countedDays, today);
  const streakDatesBeforeRange = streak.currentDates.filter((key) => key < allowed.from);

  return {
    ok: true,
    timezone,
    locale,
    pro,
    today,
    from: allowed.from,
    to: allowed.to,
    sessions,
    currentStreak: streak.current,
    bestStreak: streak.best,
    streakDatesBeforeRange,
  };
}
