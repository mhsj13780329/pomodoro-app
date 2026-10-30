import { useTranslations } from "next-intl";
import { IconFlame } from "@/components/icons";
import { useFocusStats } from "@/features/stats/use-focus-stats";
import { Link } from "@/i18n/navigation";

export function StreakChip() {
  const t = useTranslations();
  const stats = useFocusStats();
  const ready = stats.status !== "loading";
  return (
    <Link
      href="/stats"
      aria-busy={!ready}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-pill bg-focus-soft px-3.5 text-sm font-semibold text-focus-ink"
    >
      <IconFlame className="size-[18px]" />
      {ready ? <span>{t("streak", { count: stats.currentStreak })}</span> : null}
    </Link>
  );
}
