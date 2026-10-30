import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { StatsScreen } from "@/features/stats/components/stats-screen";
import { routing } from "@/i18n/routing";

export default async function StatsPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return <StatsScreen />;
}
