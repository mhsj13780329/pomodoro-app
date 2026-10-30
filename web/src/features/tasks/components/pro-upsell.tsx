import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const chips = ["proProjects", "proTags", "proSubtasks"] as const;

/** Phone: the dashed card under the list. */
export function ProUpsellCard() {
  const t = useTranslations("tasks");
  return (
    <Link
      href="/pricing"
      className="mt-3 flex flex-col gap-2 rounded-card border border-dashed border-line-strong bg-surface px-3.5 py-3 md:hidden"
    >
      <span className="text-sm font-semibold">{t("upsellTitle")}</span>
      <span className="flex flex-wrap gap-1.5">
        {chips.map((key) => (
          <span
            key={key}
            className="flex min-h-7 items-center rounded-[14px] bg-pro-bg px-2.5 text-xs font-medium text-pro-ink"
          >
            {t(key)}
          </span>
        ))}
      </span>
    </Link>
  );
}

/** Desktop: the Pro aside next to the list. */
export function ProUpsellAside() {
  const t = useTranslations("tasks");
  const points = ["asideProjects", "asideTags", "asideSubtasks", "asideUnlimited"] as const;
  return (
    <aside className="hidden min-w-0 flex-1 basis-[300px] flex-col gap-3.5 rounded-panel border border-dashed border-line-strong bg-surface p-6 md:flex">
      <span className="flex min-h-7 items-center self-start rounded-[14px] bg-pro-bg px-3 text-[13px] font-semibold text-pro-ink">
        {t("proBadge")}
      </span>
      <h2 className="text-[19px] font-bold leading-relaxed">{t("asideTitle")}</h2>
      <ul className="flex flex-col gap-1.5 text-[15px] leading-loose">
        {points.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ul>
      <Link
        href="/pricing"
        className="flex min-h-12 items-center justify-center rounded-pill bg-focus text-[15px] font-bold text-white"
      >
        {t("upgrade")}
      </Link>
    </aside>
  );
}
