import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cardClass } from "../card";

const FEATURES = ["sounds", "ambient", "notes"] as const;

/** For a free account: what Pro adds beyond this page, each row linking to pricing. */
export async function ProFeatures() {
  const t = await getTranslations("settings");
  const features = await getTranslations("pricing.features");
  const tasks = await getTranslations("tasks");

  return (
    <section className={cardClass}>
      <h2 className="mb-2 text-base font-bold md:text-lg">{t("proFeatures")}</h2>
      <ul className="m-0 list-none p-0">
        {FEATURES.map((key) => (
          <li key={key} className="border-t border-line">
            <Link href="/pricing" className="flex min-h-[52px] items-center justify-between gap-3 text-[15px] md:min-h-14">
              <span>{features(key)}</span>
              <span className="rounded-pill bg-pro-bg px-2.5 py-1 text-xs font-bold text-pro-ink">{tasks("proBadge")}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
