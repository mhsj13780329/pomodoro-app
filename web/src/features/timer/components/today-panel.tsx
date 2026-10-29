"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { formatDate, formatHourMinute, formatNumber } from "@/lib/format";
import { SAMPLE_FOCUS_MINUTES, SAMPLE_SESSIONS_DONE } from "../sample";

export function TodayPanel() {
  const locale = useLocale();
  const t = useTranslations("today");
  const [today, setToday] = useState<{ iso: string; label: string } | null>(null);
  // The calendar day is read after mount. Cache Components rejects new Date() during prerender.
  useEffect(() => {
    const now = new Date();
    setToday({ iso: now.toISOString(), label: formatDate(now, locale) });
  }, [locale]);
  // TODO: Phase 6 replaces these sample numbers with today's real totals.
  return (
    <section className="rounded-panel border border-line bg-surface p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{t("heading")}</h2>
        {today ? (
          <time dateTime={today.iso} className="text-xs text-muted">
            {today.label}
          </time>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-control bg-ground p-3 text-center">
          <div dir="ltr" className="text-[26px] font-bold leading-snug">
            {formatHourMinute(SAMPLE_FOCUS_MINUTES, locale)}
          </div>
          <div className="text-xs text-muted">{t("focusHours")}</div>
        </div>
        <div className="rounded-control bg-ground p-3 text-center">
          <div className="text-[26px] font-bold leading-snug">
            {formatNumber(SAMPLE_SESSIONS_DONE, locale)}
          </div>
          <div className="text-xs text-muted">{t("sessionsDone")}</div>
        </div>
      </div>
    </section>
  );
}
