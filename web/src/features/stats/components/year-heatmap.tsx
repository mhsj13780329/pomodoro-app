"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { IconChevron } from "@/components/icons";
import { dateLocale, formatDate } from "@/lib/format";
import { heatLevel } from "@/lib/stats/aggregate";
import { localNoon, type MonthCell } from "@/lib/stats/calendar";
import { dayNumber, weekdayNames } from "../labels";

const HEAT = [
  "bg-heat-0",
  "bg-heat-1",
  "bg-heat-2",
  "bg-heat-3",
  "bg-heat-4",
] as const;

/** GitHub's shape: one column per week, seven rows. Scrolls sideways because each day is a 44px control. */
export function YearHeatmap({
  weeks,
  anchor,
  timeZone,
  today,
  minutesByDay,
  weekStart,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
}: {
  weeks: (MonthCell | null)[][];
  anchor: Date;
  timeZone: string;
  today: string;
  minutesByDay: ReadonlyMap<string, number>;
  weekStart: number;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
}) {
  const t = useTranslations("stats");
  const locale = useLocale();
  const yearLabel = new Intl.DateTimeFormat(dateLocale(locale), {
    year: "numeric",
    timeZone,
  }).format(anchor);
  const names = weekdayNames(locale, weekStart, "short");
  const keys = weeks.flatMap((week) => week.flatMap((cell) => (cell ? [cell.key] : [])));
  const [picked, setPicked] = useState<string | null>(null);
  const focused = picked && keys.includes(picked) ? picked : keys.includes(today) ? today : (keys[0] ?? "");
  const moved = useRef(false);

  useEffect(() => {
    if (!moved.current || !focused) return;
    document.getElementById(`year-${focused}`)?.focus();
  }, [focused]);

  function move(event: React.KeyboardEvent) {
    const place = locate(weeks, focused);
    if (!place) return;
    const rtl = locale === "fa";
    let week = place.week;
    let row = place.row;
    if (event.key === "ArrowRight") week += rtl ? -1 : 1;
    else if (event.key === "ArrowLeft") week += rtl ? 1 : -1;
    else if (event.key === "ArrowDown") row += 1;
    else if (event.key === "ArrowUp") row -= 1;
    else if (event.key === "Home") {
      week = 0;
      row = 0;
    } else if (event.key === "End") {
      week = weeks.length - 1;
      row = 6;
    } else return;
    event.preventDefault();
    const next = nearest(weeks, week, row);
    if (!next) return;
    moved.current = true;
    setPicked(next);
  }

  return (
    <section className="rounded-card border border-line bg-surface px-3.5 py-3 md:rounded-panel md:px-6 md:py-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <ShiftButton label={t("prevYear")} direction="back" enabled={canGoBack} onClick={onBack} />
        <h2 className="text-base font-semibold">{yearLabel}</h2>
        <ShiftButton label={t("nextYear")} direction="forward" enabled={canGoForward} onClick={onForward} />
      </div>
      <div className="overflow-x-auto" onKeyDown={move} role="grid" aria-label={t("heatmap", { month: yearLabel })}>
        <div className="flex gap-1">
          <div className="flex flex-col gap-1">
            {names.map((name) => (
              <div key={name} className="flex h-11 w-8 items-center text-xs text-muted">
                {name}
              </div>
            ))}
          </div>
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} role="row" className="flex flex-col gap-1">
              {week.map((cell, rowIndex) => {
                if (!cell) return <div key={rowIndex} aria-hidden="true" className="size-11" />;
                const focusSec = minutesByDay.get(cell.key) ?? 0;
                const minutes = Math.floor(focusSec / 60);
                const future = cell.key > today;
                const isToday = cell.key === today;
                const noon = localNoon(cell.date, timeZone);
                const name = t("cellLabel", {
                  date: formatDate(noon, locale, timeZone),
                  minutes: t("minutes", { count: minutes }),
                });
                return (
                  <button
                    key={cell.key}
                    id={`year-${cell.key}`}
                    type="button"
                    role="gridcell"
                    tabIndex={cell.key === focused ? 0 : -1}
                    aria-current={isToday ? "date" : undefined}
                    aria-label={name}
                    className={`size-11 rounded-lg text-[12px] font-semibold ${
                      future ? "border border-dashed border-line-strong text-muted" : `${HEAT[heatLevel(focusSec)]} ${heatLevel(focusSec) === 4 ? "text-white" : "text-ink"}`
                    } ${isToday ? "ring-2 ring-inset ring-ink" : ""}`}
                  >
                    {dayNumber(noon, locale, timeZone)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function locate(weeks: (MonthCell | null)[][], key: string): { week: number; row: number } | null {
  for (let week = 0; week < weeks.length; week += 1) {
    const row = weeks[week]?.findIndex((cell) => cell?.key === key) ?? -1;
    if (row >= 0) return { week, row };
  }
  return null;
}

function nearest(weeks: (MonthCell | null)[][], week: number, row: number): string | null {
  const safeWeek = Math.max(0, Math.min(weeks.length - 1, week));
  const safeRow = Math.max(0, Math.min(6, row));
  const direct = weeks[safeWeek]?.[safeRow];
  if (direct) return direct.key;
  for (let distance = 1; distance < 8; distance += 1) {
    const before = weeks[safeWeek]?.[safeRow - distance];
    if (before) return before.key;
    const after = weeks[safeWeek]?.[safeRow + distance];
    if (after) return after.key;
  }
  return null;
}

function ShiftButton({
  label,
  direction,
  enabled,
  onClick,
}: {
  label: string;
  direction: "back" | "forward";
  enabled: boolean;
  onClick: () => void;
}) {
  const pointBack = direction === "back";
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={!enabled}
      className={`inline-flex size-11 items-center justify-center rounded-full text-ink disabled:opacity-40 ${
        pointBack ? "-scale-x-100 rtl:scale-x-100" : "rtl:-scale-x-100"
      }`}
    >
      <IconChevron className="size-5" />
    </button>
  );
}
