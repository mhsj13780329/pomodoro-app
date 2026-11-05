import { cache, Suspense, type ReactNode } from "react";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { loadProStatus } from "@/lib/entitlement";
import { UserMenu } from "@/features/auth/components/user-menu";
import { DurationSettings } from "@/features/settings/components/duration-settings";
import { LanguageSwitcher } from "@/features/settings/components/language-switcher";
import { ProFeatures } from "@/features/settings/components/pro-features";
import { SoundSettings } from "@/features/settings/components/sound-settings";
import { ThemePicker } from "@/features/settings/components/theme-picker";
import { cardClass } from "@/features/settings/card";
import { InstallGuide } from "@/features/pwa/install-guide";
import { routing } from "@/i18n/routing";

/** Reads Pro once per request (display only; every write is re-checked there). It reads request headers, so it runs inside Suspense. */
const loadPro = cache(async (): Promise<boolean> => {
  const session = await getCurrentUser();
  return session ? (await loadProStatus(session.id)).active : false;
});

/**
 * Phone: one column (account, durations, theme, sounds, language, Pro features, install).
 * Desktop: durations, theme and sounds in the wide column; account, language and the rest beside it.
 * The column wrappers are `display: contents` on phones so `order` places every card.
 */
export default async function SettingsPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("settings");

  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col pb-6">
      <h1 className="flex min-h-11 items-center text-[22px] font-bold md:text-[28px]">{t("title")}</h1>
      <div className="mt-3 flex flex-col gap-3 md:mt-6 md:grid md:grid-cols-[1.4fr_1fr] md:items-start md:gap-6">
        <div className="contents md:flex md:flex-col md:gap-6">
          <Suspense fallback={<MainCards pro={false} />}>
            <LoadedMainCards />
          </Suspense>
        </div>
        <div className="contents md:flex md:flex-col md:gap-6">
          <Slot order="order-1">
            <Suspense fallback={<section className={`${cardClass} min-h-24`} />}>
              <UserMenu loadPro={loadPro} />
            </Suspense>
          </Slot>
          <Slot order="order-5">
            <LanguageSwitcher />
          </Slot>
          <Suspense fallback={null}>
            <LoadedProFeatures />
          </Suspense>
          <Slot order="order-7">
            <InstallGuide />
          </Slot>
        </div>
      </div>
    </div>
  );
}

function Slot({ order, children }: { order: string; children: ReactNode }) {
  return <div className={`${order} md:order-none empty:hidden`}>{children}</div>;
}

async function LoadedMainCards() {
  return <MainCards pro={await loadPro()} />;
}

function MainCards({ pro }: { pro: boolean }) {
  return (
    <>
      <Slot order="order-2">
        <DurationSettings pro={pro} />
      </Slot>
      <Slot order="order-3">
        <ThemePicker pro={pro} />
      </Slot>
      <Slot order="order-4">
        <SoundSettings pro={pro} />
      </Slot>
    </>
  );
}

async function LoadedProFeatures() {
  if (await loadPro()) return null;
  return (
    <Slot order="order-6">
      <ProFeatures />
    </Slot>
  );
}
