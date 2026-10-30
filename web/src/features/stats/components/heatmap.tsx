"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { IconChevron } from "@/components/icons";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import { heatLevel } from "@/lib/stats/aggregate";
import { localNoon, type MonthCell } from "@/lib/stats/calendar";
import { dayNumber, monthTitle, weekdayNames } from "../labels";

const HEAT = [
  "bg-heat-0 text-ink",
  "bg-heat-1 text-ink",
  "bg-heat-2 text-ink",
  "bg-heat-3 text-ink",
  "bg-heat-4 text-white",
] as const;

export function Heatmap({
  cells,
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
  cells: MonthCell[];
  anchor: Date;
  timeZone: string;
  today: string;
  minutesByDay: ReadonlyMap<string, number>;
  weekStart: number;
  /** Free accounts cannot open an earlier month. The control links to pricing instead. */
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
}) {
  const t = useTranslations("stats");
  const locale = useLocale();
  const labelId = useId();
  const title = monthTitle(anchor, locale, timeZone);
  const names = weekdayNames(locale, weekStart, "short");
  const longNames = weekdayNames(locale, weekStart, "long");
  const inMonth = cells.filter((cell) => cell.inMonth).map((cell) => cell.key);
  const [picked, setPicked] = useState<string | null>(null);
  const focused = picked && inMonth.includes(picked) ? picked : inMonth.includes(today) ? today : (inMonth[0] ?? "");
  const moved = useRef(false);

  useEffect(() => {
    if (!moved.current || !focused) return;
    document.getElementById(`${labelId}-${focused}`)?.focus();
  }, [focused, labelId]);

  function move(event: React.KeyboardEvent) {
    const index = inMonth.indexOf(focused);
    if (index < 0) return;
    const rtl = locale === "fa";
    let next = index;
    if (event.key === "ArrowRight") next = index + (rtl ? -1 : 1);
    else if (event.key === "ArrowLeft") next = index + (rtl ? 1 : -1);
    else if (event.key === "ArrowDown") next = index + 7;
    else if (event.key === "ArrowUp") next = index - 7;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = inMonth.length - 1;
    else return;
    event.preventDefault();
    const clamped = Math.max(0, Math.min(inMonth.length - 1, next));
    moved.current = true;
    setPicked(inMonth[clamped] ?? focused);
  }

  const rows: MonthCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <section className="rounded-card border border-line bg-surface px-3.5 py-3 md:rounded-panel md:px-6 md:py-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <MonthButton label={t("prevMonth")} direction="back" mode={canGoBack ? "button" : "link"} onClick={onBack} />
        <h2 id={labelId} className="text-base font-semibold">
          {title}
        </h2>
        <MonthButton
          label={t("nextMonth")}
          direction="forward"
          mode={canGoForward ? "button" : "disabled"}
          onClick={onForward}
        />
      </div>
      <div
        role="grid"
        aria-labelledby={labelId}
        onKeyDown={move}
        className="flex flex-col gap-1 md:gap-2"
      >
        <div role="row" className="grid grid-cols-7 gap-1 md:hidden">
          {names.map((name) => (
            <div key={name} role="columnheader" className="text-center text-xs text-muted">
              {name}
            </div>
          ))}
        </div>
        <div role="row" className="hidden grid-cols-7 gap-2 md:grid">
          {longNames.map((name) => (
            <div key={name} role="columnheader" className="truncate text-center text-[13px] text-muted">
              {name}
            </div>
          ))}
        </div>
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} role="row" className="grid grid-cols-7 gap-1 md:gap-2">
            {row.map((cell) => {
              if (!cell.inMonth) {
                return <div key={cell.key} aria-hidden="true" className="min-h-11" />;
              }
              const minutes = Math.floor((minutesByDay.get(cell.key) ?? 0) / 60);
              const future = cell.key > today;
              const isToday = cell.key === today;
              const level = future ? 0 : heatLevel((minutesByDay.get(cell.key) ?? 0));
              const noon = localNoon(cell.date, timeZone);
              const name = t("cellLabel", {
                date: formatDate(noon, locale, timeZone),
                minutes: t("minutes", { count: minutes }),
              });
              const extra = isToday ? t("todayCell") : future ? t("upcoming") : "";
              return (
                <button
                  key={cell.key}
                  id={`${labelId}-${cell.key}`}
                  type="button"
                  role="gridcell"
                  tabIndex={cell.key === focused ? 0 : -1}
                  aria-current={isToday ? "date" : undefined}
                  aria-label={extra ? `${name}. ${extra}` : name}
                  className={`min-h-11 rounded-lg text-xs font-semibold md:min-h-14 md:rounded-xl md:text-sm ${
                    future
                      ? "border border-dashed border-line-strong text-muted"
                      : HEAT[level]
                  } ${isToday ? "ring-2 ring-inset ring-ink" : ""}`}
                >
                  {dayNumber(noon, locale, timeZone)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted">
        <span>{t("less")}</span>
        {HEAT.map((tone) => (
          <span key={tone} className={`size-3.5 rounded md:size-4 ${tone.split(" ")[0]}`} />
        ))}
        <span>{t("more")}</span>
      </div>
    </section>
  );
}

function MonthButton({
  label,
  direction,
  mode,
  onClick,
}: {
  label: string;
  direction: "back" | "forward";
  mode: "button" | "link" | "disabled";
  onClick: () => void;
}) {
  const pointBack = direction === "back";
  const className = `inline-flex size-11 items-center justify-center rounded-full text-ink ${
    pointBack ? "-scale-x-100 rtl:scale-x-100" : "rtl:-scale-x-100"
  }`;
  if (mode === "link") {
    return (
      <Link href="/pricing" aria-label={label} className={className}>
        <IconChevron className="size-5" />
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} onClick={onClick} disabled={mode === "disabled"} className={`${className} disabled:opacity-40`}>
      <IconChevron className="size-5" />
    </button>
  );
}
