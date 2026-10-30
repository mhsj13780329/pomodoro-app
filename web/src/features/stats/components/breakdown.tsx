"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatHourMinute, formatNumber } from "@/lib/format";
import type { StatsBreakdownRow } from "@/lib/stats/contract";

export function Breakdown({
  tasks,
  projects,
}: {
  tasks: StatsBreakdownRow[];
  projects: StatsBreakdownRow[];
}) {
  const t = useTranslations("stats");
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <BucketList title={t("breakdownTasks")} rows={tasks} emptyLabel={t("noTask")} deletedLabel={t("deleted")} />
      <BucketList title={t("breakdownProjects")} rows={projects} emptyLabel={t("noProject")} deletedLabel={t("deleted")} />
    </div>
  );
}

function BucketList({
  title,
  rows,
  emptyLabel,
  deletedLabel,
}: {
  title: string;
  rows: StatsBreakdownRow[];
  emptyLabel: string;
  deletedLabel: string;
}) {
  const locale = useLocale();
  return (
    <section className="rounded-card border border-line bg-surface p-3.5 md:rounded-panel md:p-5">
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row) => {
            const name = row.id == null ? emptyLabel : (row.name ?? emptyLabel);
            return (
              <li key={row.id ?? "none"} className="flex min-h-11 items-center justify-between gap-3 border-b border-line py-1 last:border-b-0">
                <span className="min-w-0 truncate text-[15px]">
                  {name}
                  {row.deleted ? <span className="ms-2 text-xs text-muted">({deletedLabel})</span> : null}
                </span>
                <span className="shrink-0 text-sm text-muted" dir="ltr">
                  {formatHourMinute(Math.floor(row.focusSec / 60), locale)}
                  <span className="ms-2">{formatNumber(row.sessions, locale)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
