import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LoginScreen } from "@/features/auth/components/login-screen";
import { routing } from "@/i18n/routing";
import { pricingReturnPath } from "@/lib/payments/return-path";

export default async function LoginPage({
  params,
  searchParams,
}: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-8">
      <Suspense fallback={<div className="min-h-40" />}>
        <LoginWithReturn searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function LoginWithReturn({
  searchParams,
}: {
  searchParams: PageProps<"/[locale]/login">["searchParams"];
}) {
  const query = await searchParams;
  const next = typeof query.next === "string" ? query.next : null;
  return <LoginScreen returnTo={pricingReturnPath(next)} />;
}
