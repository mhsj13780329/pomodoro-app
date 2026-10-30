"use client";

import { useTranslations } from "next-intl";
import { IconLock } from "@/components/icons";
import { Link } from "@/i18n/navigation";

const RANGES = ["today", "week", "month"] as const;

export type StatsRange = "today" | "week" | "month";

/** Year stays a link until the account is Pro. The server rejects that range for everyone else. */
export function RangeBar({
  value,
  pro,
  onChange,
}: {
  value: StatsRange | "year";
  pro: boolean;
  onChange: (next: StatsRange | "year") => void;
}) {
  const t = useTranslations("stats");
  return (
    <div
      role="radiogroup"
      aria-label={t("rangeLabel")}
      className="flex gap-1 rounded-track bg-surface-2 p-1 md:w-[360px]"
    >
      {RANGES.map((range) => {
        const selected = value === range;
        return (
          <button
            key={range}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(range)}
            className={`min-h-11 flex-1 rounded-tab px-2 text-sm font-semibold ${
              selected ? "bg-focus text-white" : "text-ink"
            }`}
          >
            {t(`ranges.${range}`)}
          </button>
        );
      })}
      {pro ? (
        <button
          type="button"
          role="radio"
          aria-checked={value === "year"}
          onClick={() => onChange("year")}
          className={`min-h-11 flex-1 rounded-tab px-2 text-sm font-semibold ${
            value === "year" ? "bg-focus text-white" : "text-ink"
          }`}
        >
          {t("ranges.year")}
        </button>
      ) : (
        <Link
          href="/pricing"
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-tab px-2 text-sm font-semibold text-ink"
        >
          <span>{t("ranges.year")}</span>
          <IconLock className="size-3.5" />
        </Link>
      )}
    </div>
  );
}
