"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { IconLock } from "@/components/icons";
import { useTasksStore } from "@/features/tasks/store";
import { StreakChip } from "@/features/timer/components/streak-chip";
import { Link } from "@/i18n/navigation";
import { dailyAverageSec, foldStats, totalsInRange, type StatSession } from "@/lib/stats/aggregate";
import {
  addCivilDays,
  calendarForLocale,
  civilKey,
  eachDay,
  localNoon,
  monthGrid,
  parseCivil,
  shiftCalendarMonth,
  startOfCalendarMonth,
  startOfCalendarYear,
  weekStartsOn,
  yearWeeks,
} from "@/lib/stats/calendar";
import type { StatsResponse } from "@/lib/stats/contract";
import { Breakdown } from "./breakdown";
import { Heatmap } from "./heatmap";
import { RangeBar, type StatsRange } from "./range-bar";
import { SummaryCards } from "./summary-cards";
import { WeekBars } from "./week-bars";
import { YearHeatmap } from "./year-heatmap";
import { withPendingBuckets } from "../present";
import { toStatSession } from "../sessions";
import { useFocusStats, useStatsView } from "../use-focus-stats";

export function StatsScreen() {
  const t = useTranslations("stats");
  const locale = useLocale();
  const stats = useFocusStats();
  const tasks = useTasksStore((state) => state.tasks);
  const projects = useTasksStore((state) => state.projects);
  const queued = useTasksStore((state) => state.pendingSessions);
  const [range, setRange] = useState<StatsRange | "year">("month");
  const [monthShift, setMonthShift] = useState(0);
  const [yearShift, setYearShift] = useState(0);

  const ready = stats.status !== "loading" && stats.today !== "";
  const todayDate = ready ? parseCivil(stats.today) : null;
  const calendar = calendarForLocale(locale);
  const weekStart = weekStartsOn(locale);
  const monthsBack = stats.pro ? monthShift : 0;
  const yearsBack = stats.pro ? yearShift : 0;

  let from = stats.today;
  let to = stats.today;
  let grid: ReturnType<typeof monthGrid> | null = null;
  let weeks: ReturnType<typeof yearWeeks> | null = null;
  let anchor: Date | null = null;

  if (todayDate) {
    const noon = localNoon(todayDate, stats.timeZone);
    if (range === "week") from = civilKey(addCivilDays(todayDate, -6));
    if (range === "month") {
      anchor = shiftCalendarMonth(noon, monthsBack, stats.timeZone, calendar);
      grid = monthGrid(anchor, stats.timeZone, calendar, weekStart);
      const days = grid.cells.filter((cell) => cell.inMonth);
      from = days[0]?.key ?? from;
      to = days[days.length - 1]?.key ?? to;
    }
    if (range === "year") {
      anchor = shiftCalendarMonth(noon, yearsBack * 12, stats.timeZone, calendar);
      const start = startOfCalendarYear(anchor, stats.timeZone, calendar);
      const nextYear = shiftCalendarMonth(localNoon(start, stats.timeZone), 12, stats.timeZone, calendar);
      const end = addCivilDays(startOfCalendarMonth(nextYear, stats.timeZone, calendar), -1);
      from = civilKey(start);
      to = civilKey(end);
      weeks = yearWeeks(anchor, stats.timeZone, calendar, weekStart);
    }
  }

  const outsideHome = range === "year" || monthsBack !== 0;
  const viewState = useStatsView(ready && stats.pro ? { from, to, breakdown: true } : null);
  const extra = enrich(queued.map(toStatSession).concat(stats.handedOff), tasks);

  const viewDays = viewState.view
    ? foldStats({
        serverSessions: viewState.view.sessions.map(wireSession),
        pending: extra,
        streakDatesBeforeRange: [],
        serverBest: viewState.view.bestStreak,
        today: stats.today,
        timeZone: stats.timeZone,
      }).byDay
    : null;

  const byDay = outsideHome ? (viewDays ?? new Map()) : stats.byDay;
  const waiting = outsideHome && !viewState.settled;
  const total = ready && !waiting ? totalsInRange(byDay, from, to) : { focusSec: 0, sessions: 0, key: from };
  const average = ready && !waiting ? dailyAverageSec(total.focusSec, from, to, stats.today) : 0;
  const weekFrom = todayDate ? civilKey(addCivilDays(todayDate, -6)) : "";
  const weekDays = weekFrom
    ? eachDay(weekFrom, stats.today).map((key) => ({ key, focusSec: stats.byDay.get(key)?.focusSec ?? 0 }))
    : [];
  const minutes = new Map<string, number>();
  for (const [key, day] of byDay) minutes.set(key, day.focusSec);

  const known = new Set(viewState.view?.sessions.map((session) => session.id) ?? []);
  const fresh = extra.filter((session) => !known.has(session.id));
  const taskNames = new Map(Object.values(tasks).map((task) => [task.id, { name: task.title, deleted: task.deletedAt != null }]));
  const projectNames = new Map(
    Object.values(projects).map((project) => [project.id, { name: project.name, deleted: project.deletedAt != null }]),
  );
  const taskRows = withPendingBuckets(viewState.view?.tasks ?? [], fresh, "task", taskNames);
  const projectRows = withPendingBuckets(viewState.view?.projects ?? [], fresh, "project", projectNames);

  const nothingYet = ready && stats.bestStreak === 0 && stats.sessions.length === 0 && !outsideHome;
  const showWeek = range === "week" || (range === "month" && monthsBack === 0);

  return (
    <div className="flex flex-col gap-4 pb-4 md:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-bold leading-relaxed md:text-[26px]">{t("title")}</h1>
        <div className="flex items-center gap-2">
          <StreakChip />
          {ready && !stats.pro ? (
            <Link
              href="/pricing"
              className="inline-flex min-h-11 items-center rounded-pill bg-pro-bg px-3.5 text-[13px] font-semibold text-pro-ink md:hidden"
            >
              {t("pro")}
            </Link>
          ) : null}
        </div>
      </div>

      <RangeBar value={range} pro={ready && stats.pro} onChange={setRange} />

      {stats.offline ? (
        <p className="text-sm text-muted" role="status">
          {stats.status === "offline" && stats.sessions.length === 0 ? t("offlineEmpty") : t("offline")}
        </p>
      ) : null}

      {!ready || waiting ? (
        <p className="text-sm text-muted" role="status">
          {t("loading")}
        </p>
      ) : (
        <>
          {nothingYet ? <p className="text-sm text-muted">{t("empty")}</p> : null}
          <SummaryCards
            focusSec={total.focusSec}
            sessions={total.sessions}
            bestStreak={stats.bestStreak}
            averageSec={average}
          />
          {range === "year" && weeks && anchor ? (
            <YearHeatmap
              weeks={weeks.weeks}
              anchor={anchor}
              timeZone={stats.timeZone}
              today={stats.today}
              minutesByDay={minutes}
              weekStart={weekStart}
              canGoBack
              canGoForward={yearsBack < 0}
              onBack={() => setYearShift((value) => value - 1)}
              onForward={() => setYearShift((value) => Math.min(0, value + 1))}
            />
          ) : null}
          {range === "month" && grid && anchor ? (
            <div className="flex flex-col gap-4 md:flex-row md:items-start">
              <div className="min-w-0 md:flex-[1.3]">
                <Heatmap
                  cells={grid.cells}
                  anchor={anchor}
                  timeZone={stats.timeZone}
                  today={stats.today}
                  minutesByDay={minutes}
                  weekStart={weekStart}
                  canGoBack={stats.pro}
                  canGoForward={monthsBack < 0}
                  onBack={() => setMonthShift((value) => value - 1)}
                  onForward={() => setMonthShift((value) => Math.min(0, value + 1))}
                />
              </div>
              {showWeek ? (
                <div className="hidden min-w-0 md:block md:flex-1">
                  <WeekBars days={weekDays} today={stats.today} weekStart={weekStart} />
                </div>
              ) : null}
            </div>
          ) : null}
          {range === "week" ? <WeekBars days={weekDays} today={stats.today} weekStart={weekStart} /> : null}
          {stats.pro && viewState.settled && viewState.view ? (
            <Breakdown tasks={taskRows} projects={projectRows} />
          ) : null}
          {!stats.pro ? <Upsell wide={range !== "today"} /> : null}
          {stats.pro ? (
            <a
              href={`/api/stats/export?from=${from}&to=${to}&locale=${locale}`}
              className="inline-flex min-h-11 items-center self-start rounded-pill bg-focus px-4 text-sm font-semibold text-white"
            >
              {t("export")}
            </a>
          ) : (
            <Link
              href="/pricing"
              className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-pill bg-pro-bg px-3.5 text-sm font-semibold text-pro-ink"
            >
              <IconLock className="size-4" />
              <span>{t("export")}</span>
            </Link>
          )}
        </>
      )}
    </div>
  );
}

function enrich(
  sessions: StatSession[],
  tasks: Record<string, { projectId: string | null }>,
): StatSession[] {
  return sessions.map((session) => ({
    ...session,
    projectId: session.taskId ? (tasks[session.taskId]?.projectId ?? null) : null,
  }));
}

function wireSession(session: StatsResponse["sessions"][number]): StatSession {
  return {
    id: session.id,
    startedAt: Date.parse(session.startedAt),
    endedAt: Date.parse(session.endedAt),
    durationSec: session.durationSec,
    phase: "focus",
    completed: true,
    taskId: session.taskId,
    projectId: session.projectId,
  };
}

function Upsell({ wide }: { wide: boolean }) {
  const t = useTranslations("stats");
  return (
    <Link
      href="/pricing"
      className="flex items-center gap-3 rounded-card border border-dashed border-line-strong bg-surface px-3.5 py-3"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pro-bg text-pro-ink">
        <IconLock className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold">{wide ? t("upsellYearTitle") : t("upsellTitle")}</span>
        <span className="text-[13px] text-muted">{wide ? t("upsellYearBody") : t("upsellBody")}</span>
      </span>
    </Link>
  );
}
