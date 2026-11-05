import { Suspense } from "react";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { NotesScreen } from "@/features/notes/components/notes-screen";
import { routing } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/current-user";
import { loadProStatus } from "@/lib/entitlement";

/** Reads the session and Pro on the server, then hands both to the client screen. */
async function NotesGate() {
  const user = await getCurrentUser();
  const status = user ? await loadProStatus(user.id) : null;
  return <NotesScreen userId={user?.id ?? null} pro={status?.active ?? false} />;
}

export default async function NotesPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <Suspense fallback={<div aria-busy="true" className="h-40" />}>
      <NotesGate />
    </Suspense>
  );
}
