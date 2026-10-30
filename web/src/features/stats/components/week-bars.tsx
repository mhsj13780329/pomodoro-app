"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatHourMinute } from "@/lib/format";
import { weekdayNames } from "../labels";

export function WeekBars({
  days,
  today,
  weekStart,
}: {
  days: { key: string; focusSec: number }[];
  today: string;
  weekStart: number;
}) {
  const t = useTranslations("stats");
  const locale = useLocale();
  const names = weekdayNames(locale, weekStart, "short");
  const max = Math.max(...days.map((day) => day.focusSec), 1);
  const width = 280;
  const height = 168;
  const slot = width / Math.max(days.length, 1);

  return (
    <section className="rounded-card border border-line bg-surface p-3.5 md:rounded-panel md:p-5">
      <h2 className="mb-2 text-base font-semibold">{t("weekChart")}</h2>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="group"
        aria-label={t("weekChart")}
      >
        {days.map((day, index) => {
          const minutes = Math.floor(day.focusSec / 60);
          const label = formatHourMinute(minutes, locale);
          const barHeight = day.focusSec === 0 ? 8 : Math.max(12, (day.focusSec / max) * 96);
          const x = index * slot;
          const y = 28 + (110 - barHeight);
          const todayBar = day.key === today;
          return (
            <g key={day.key}>
              <text
                x={x + slot / 2}
                y={16}
                textAnchor="middle"
                className="fill-muted text-[12px]"
                style={{ direction: "ltr" }}
              >
                {label}
              </text>
              {day.focusSec === 0 ? (
                <rect
                  x={x + slot / 2 - 10}
                  y={y}
                  width={20}
                  height={barHeight}
                  rx={4}
                  className="fill-none stroke-line-strong"
                  strokeDasharray="3 3"
                >
                  <title>{`${names[index] ?? ""} ${label}`}</title>
                </rect>
              ) : (
                <rect
                  x={x + slot / 2 - 10}
                  y={y}
                  width={20}
                  height={barHeight}
                  rx={6}
                  className={todayBar ? "fill-focus" : "fill-heat-2"}
                >
                  <title>{`${names[index] ?? ""} ${label}`}</title>
                </rect>
              )}
              <text x={x + slot / 2} y={height - 6} textAnchor="middle" className="fill-muted text-[12px]">
                {names[index]}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}
