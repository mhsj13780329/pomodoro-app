import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { TasksScreen } from "@/features/tasks/components/tasks-screen";
import { routing } from "@/i18n/routing";

export default async function TasksPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return <TasksScreen />;
}
