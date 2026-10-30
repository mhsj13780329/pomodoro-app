import { Suspense } from "react";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { UserMenu } from "@/features/auth/components/user-menu";
import { LanguageSwitcher } from "@/features/settings/components/language-switcher";
import { ThemePicker } from "@/features/settings/components/theme-picker";
import { routing } from "@/i18n/routing";

export default async function SettingsPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("settings");

  return (
    <div className="flex flex-col">
      <h1 className="flex min-h-11 items-center text-[22px] font-bold">{t("title")}</h1>
      <Suspense
        fallback={
          <section className="mt-3 min-h-24 rounded-card border border-line bg-surface p-3.5" />
        }
      >
        <UserMenu />
      </Suspense>
      <section className="mt-3 rounded-card border border-line bg-surface p-3.5">
        <h2 className="mb-2.5 text-base font-semibold">{t("theme")}</h2>
        <ThemePicker />
      </section>
      <section className="mt-3 rounded-card border border-line bg-surface p-3.5">
        <h2 className="mb-2.5 text-base font-semibold">{t("language")}</h2>
        <LanguageSwitcher />
      </section>
    </div>
  );
}
