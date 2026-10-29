import { setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { TimerScreen } from "@/features/timer/components/timer-screen";
import { routing } from "@/i18n/routing";

export default async function TimerPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return <TimerScreen />;
}
