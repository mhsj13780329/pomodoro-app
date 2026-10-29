import type { Metadata } from "next";
import Script from "next/script";
import "@fontsource-variable/vazirmatn";
import { hasLocale } from "next-intl";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { APP_NAME } from "@/config/brand";
import { ThemeSync } from "@/features/settings/components/theme-sync";
import { THEME_COOKIE } from "@/features/settings/theme";
import { dirFor, routing } from "@/i18n/routing";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(props: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: APP_NAME,
    description: t("description", { appName: APP_NAME }),
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      data-theme="warm"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full bg-ground font-sans text-ink">
        {/* The theme cookie is the choice saved in Settings. beforeInteractive runs
            before paint. cookies() in this layout would block navigation. */}
        <Script id="theme" strategy="beforeInteractive">
          {`(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);var t=m&&decodeURIComponent(m[1]);if(t==="warm"||t==="night"||t==="forest")document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`}
        </Script>
        <ThemeSync />
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
