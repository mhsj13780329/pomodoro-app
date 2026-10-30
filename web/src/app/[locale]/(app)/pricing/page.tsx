import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";

// Placeholder: the real pricing page and payments arrive in Phase 7. It exists now so the Pro lock has somewhere to link.
export default async function PricingPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("pricing");
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-[22px] font-bold leading-relaxed md:text-[26px]">{t("title")}</h1>
      <p className="text-[15px] text-muted">{t("soon")}</p>
    </div>
  );
}
