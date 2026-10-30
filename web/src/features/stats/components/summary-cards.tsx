"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatHourMinute, formatNumber } from "@/lib/format";

export function SummaryCards({
  focusSec,
  sessions,
  bestStreak,
  averageSec,
}: {
  focusSec: number;
  sessions: number;
  bestStreak: number;
  averageSec: number;
}) {
  const t = useTranslations("stats");
  const locale = useLocale();
  const minutes = Math.floor(focusSec / 60);
  const averageMinutes = Math.floor(averageSec / 60);
  return (
    <div className="grid grid-cols-3 gap-2 md:grid-cols-4 md:gap-4">
      <Card value={formatHourMinute(minutes, locale)} label={t("focusTime")} ltr />
      <Card value={formatNumber(sessions, locale)} label={t("sessions")} />
      <Card
        value={formatHourMinute(averageMinutes, locale)}
        label={t("average")}
        ltr
        className="hidden md:flex"
      />
      <Card value={formatNumber(bestStreak, locale)} label={t("best")} />
    </div>
  );
}

function Card({
  value,
  label,
  ltr = false,
  className = "",
}: {
  value: string;
  label: string;
  ltr?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-control bg-surface px-2 py-3 text-center md:rounded-card md:py-4 ${className}`}>
      <div dir={ltr ? "ltr" : undefined} className="text-2xl font-bold leading-snug md:text-3xl">
        {value}
      </div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
