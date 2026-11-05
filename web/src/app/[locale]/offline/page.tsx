import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";

/** Shown by the service worker when a page is neither online nor in the cache. */
export default async function OfflinePage({ params }: PageProps<"/[locale]/offline">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("offline");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-[22px] font-bold">{t("title")}</h1>
      <p className="text-[15px] text-muted">{t("body")}</p>
      {/* A plain link: this page must work without the app's client code. */}
      <a
        href={`/${locale}`}
        className="flex min-h-11 items-center rounded-nav bg-focus px-5 text-[15px] font-semibold text-white"
      >
        {t("retry")}
      </a>
    </main>
  );
}
