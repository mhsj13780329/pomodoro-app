import { useLocale, useTranslations } from "next-intl";
import { formatDate, formatHourMinute, formatNumber } from "@/lib/format";
import { localNoon, parseCivil } from "@/lib/stats/calendar";
import { useFocusStats } from "@/features/stats/use-focus-stats";

export function TodayPanel() {
  const locale = useLocale();
  const t = useTranslations("today");
  const stats = useFocusStats();
  const ready = stats.status !== "loading" && stats.today !== "";
  const todayDate = ready ? parseCivil(stats.today) : null;
  const label = todayDate ? formatDate(localNoon(todayDate, stats.timeZone), locale, stats.timeZone) : null;

  return (
    <section className="rounded-panel border border-line bg-surface p-5" aria-busy={!ready}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{t("heading")}</h2>
        {label ? (
          <time dateTime={stats.today} className="text-xs text-muted">
            {label}
          </time>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-control bg-ground p-3 text-center">
          <div dir="ltr" className="text-[26px] font-bold leading-snug">
            {ready ? formatHourMinute(Math.floor(stats.todayFocusSec / 60), locale) : "\u00a0"}
          </div>
          <div className="text-xs text-muted">{t("focusHours")}</div>
        </div>
        <div className="rounded-control bg-ground p-3 text-center">
          <div className="text-[26px] font-bold leading-snug">
            {ready ? formatNumber(stats.todaySessions, locale) : "\u00a0"}
          </div>
          <div className="text-xs text-muted">{t("sessionsDone")}</div>
        </div>
      </div>
    </section>
  );
}
