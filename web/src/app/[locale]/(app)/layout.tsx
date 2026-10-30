import type { ReactNode } from "react";
import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ExpiryBannerSlot } from "@/features/pricing/components/expiry-banner-slot";
import { routing } from "@/i18n/routing";

export default async function AppLayout({
  children,
  params,
}: LayoutProps<"/[locale]"> & { children: ReactNode }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <AppShell>
      {/* The session is request data. The rest of the page does not wait on it. */}
      <Suspense fallback={null}>
        <ExpiryBannerSlot />
      </Suspense>
      {children}
    </AppShell>
  );
}
