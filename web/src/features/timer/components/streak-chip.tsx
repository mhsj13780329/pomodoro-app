import { useTranslations } from "next-intl";
import { IconFlame } from "@/components/icons";
import { Link } from "@/i18n/navigation";
import { SAMPLE_STREAK_DAYS } from "../sample";

export function StreakChip() {
  const t = useTranslations();
  // TODO: Phase 6 fills this with the real streak.
  return (
    <Link
      href="/stats"
      className="inline-flex min-h-11 items-center gap-1.5 rounded-pill bg-focus-soft px-3.5 text-sm font-semibold text-focus-ink"
    >
      <IconFlame className="size-[18px]" />
      <span>{t("streak", { count: SAMPLE_STREAK_DAYS })}</span>
    </Link>
  );
}
