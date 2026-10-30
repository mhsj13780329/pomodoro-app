"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { IconLock } from "@/components/icons";
import { StreakChip } from "@/features/timer/components/streak-chip";
import { Link } from "@/i18n/navigation";
import { dailyAverageSec, totalsInRange } from "@/lib/stats/aggregate";
import {
  addCivilDays,
  calendarForLocale,
  civilKey,
  eachDay,
  localNoon,
  monthGrid,
  parseCivil,
  weekStartsOn,
} from "@/lib/stats/calendar";
import { Heatmap } from "./heatmap";
import { RangeBar, type StatsRange } from "./range-bar";
import { SummaryCards } from "./summary-cards";
import { WeekBars } from "./week-bars";
import { useFocusStats } from "../use-focus-stats";

export function StatsScreen() {
  const t = useTranslations("stats");
  const locale = useLocale();
  const stats = useFocusStats();
  const [range, setRange] = useState<StatsRange | "year">("month");
  const ready = stats.status !== "loading" && stats.today !== "";
  const todayDate = ready ? parseCivil(stats.today) : null;
  const anchor = todayDate ? localNoon(todayDate, stats.timeZone) : null;
  const grid = anchor
    ? monthGrid(anchor, stats.timeZone, calendarForLocale(locale), weekStartsOn(locale))
    : null;

  let from = stats.today;
  let to = stats.today;
  if (ready && todayDate && range === "week") from = civilKey(addCivilDays(todayDate, -6));
  if (grid && range === "month") {
    const days = grid.cells.filter((cell) => cell.inMonth);
    from = days[0]?.key ?? from;
    to = days[days.length - 1]?.key ?? to;
  }

  const total = ready ? totalsInRange(stats.byDay, from, to) : { focusSec: 0, sessions: 0, key: from };
  const average = ready ? dailyAverageSec(total.focusSec, from, to, stats.today) : 0;
  const weekFrom = todayDate ? civilKey(addCivilDays(todayDate, -6)) : "";
  const weekDays = weekFrom
    ? eachDay(weekFrom, stats.today).map((key) => ({ key, focusSec: stats.byDay.get(key)?.focusSec ?? 0 }))
    : [];
  const minutes = new Map<string, number>();
  if (ready) {
    for (const [key, day] of stats.byDay) minutes.set(key, day.focusSec);
  }
  const nothingYet = ready && stats.bestStreak === 0 && stats.sessions.length === 0;
  const showWeek = range === "week" || range === "month";
  const showHeat = range === "month" && grid && anchor;

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

      {!ready ? (
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
          {range === "year" ? null : (
            <div className={showHeat ? "flex flex-col gap-4 md:flex-row md:items-start" : "flex flex-col gap-4"}>
              {showHeat && anchor ? (
                <div className="min-w-0 md:flex-[1.3]">
                  <Heatmap
                    cells={grid.cells}
                    anchor={anchor}
                    timeZone={stats.timeZone}
                    today={stats.today}
                    minutesByDay={minutes}
                    weekStart={weekStartsOn(locale)}
                    canGoBack={false}
                    canGoForward={false}
                    onBack={() => {}}
                    onForward={() => {}}
                  />
                </div>
              ) : null}
              {showWeek ? (
                <div className={`min-w-0 md:flex-1 ${range === "month" ? "hidden md:block" : ""}`}>
                  <WeekBars days={weekDays} today={stats.today} weekStart={weekStartsOn(locale)} />
                </div>
              ) : null}
            </div>
          )}
          {!stats.pro ? <Upsell wide={range !== "today"} /> : null}
          {ready && !stats.pro ? (
            <Link
              href="/pricing"
              className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-pill bg-pro-bg px-3.5 text-sm font-semibold text-pro-ink"
            >
              <IconLock className="size-4" />
              <span>{t("export")}</span>
            </Link>
          ) : null}
        </>
      )}
    </div>
  );
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
