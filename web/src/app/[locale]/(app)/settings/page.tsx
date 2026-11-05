import { Suspense } from "react";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { loadProStatus } from "@/lib/entitlement";
import { UserMenu } from "@/features/auth/components/user-menu";
import { DurationSettings } from "@/features/settings/components/duration-settings";
import { LanguageSwitcher } from "@/features/settings/components/language-switcher";
import { SoundSettings } from "@/features/settings/components/sound-settings";
import { ThemePicker } from "@/features/settings/components/theme-picker";
import { InstallGuide } from "@/features/pwa/install-guide";
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
      <Suspense fallback={<ProSettings pro={false} themeTitle={t("theme")} />}>
        <LoadedProSettings themeTitle={t("theme")} />
      </Suspense>
      <InstallGuide />
      <section className="mt-3 rounded-card border border-line bg-surface p-3.5">
        <h2 className="mb-2.5 text-base font-semibold">{t("language")}</h2>
        <LanguageSwitcher />
      </section>
    </div>
  );
}

/** Reads Pro on the server (display only; every write is re-checked there). Inside Suspense: it reads request headers. */
async function LoadedProSettings({ themeTitle }: { themeTitle: string }) {
  const session = await getCurrentUser();
  const pro = session ? (await loadProStatus(session.id)).active : false;
  return <ProSettings pro={pro} themeTitle={themeTitle} />;
}

function ProSettings({ pro, themeTitle }: { pro: boolean; themeTitle: string }) {
  return (
    <>
      <DurationSettings pro={pro} />
      <SoundSettings pro={pro} />
      <section className="mt-3 rounded-card border border-line bg-surface p-3.5">
        <h2 className="mb-2.5 text-base font-semibold">{themeTitle}</h2>
        <ThemePicker pro={pro} />
      </section>
    </>
  );
}
