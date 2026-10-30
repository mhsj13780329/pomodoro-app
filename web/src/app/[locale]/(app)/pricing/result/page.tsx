import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { IconChevron } from "@/components/icons";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/current-user";
import { formatCode, formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

const PAYMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PaymentResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ payment?: string | string[]; outcome?: string | string[] }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("pricing");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col pb-6">
      <div className="flex min-h-11 items-center">
        <Link href="/pricing" aria-label={t("back")} className="-ms-2.5 flex size-11 items-center justify-center">
          <IconChevron className="size-6 ltr:-scale-x-100" />
        </Link>
      </div>
      <Suspense fallback={<div className="mt-4 min-h-40" />}>
        <ResultBody locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ResultBody({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: Promise<{ payment?: string | string[]; outcome?: string | string[] }>;
}) {
  const t = await getTranslations("pricing.result");
  const query = await searchParams;
  const paymentId = typeof query.payment === "string" ? query.payment : "";
  const session = await getCurrentUser();

  // Only this user's row. A missing or foreign id looks the same, so we don't reveal it.
  const payment =
    session && PAYMENT_ID.test(paymentId)
      ? await prisma.payment.findFirst({
          where: { id: paymentId, userId: session.id },
          select: { status: true, plan: true, refId: true, errorCode: true },
        })
      : null;

  const account = session
    ? await prisma.user.findUnique({
        where: { id: session.id },
        select: { proUntil: true, proLifetime: true, timezone: true },
      })
    : null;

  let title = t("unknownTitle");
  let body = t("unknownBody");
  if (payment?.status === "PAID") {
    title = t("successTitle");
    const ref = payment.refId ? t("successRef", { ref: formatCode(payment.refId, locale) }) : "";
    const until =
      payment.plan === "LIFETIME" || account?.proLifetime === true
        ? t("successLifetime")
        : account?.proUntil
          ? t("successUntil", {
              date: formatDate(account.proUntil, locale, account.timezone || "Asia/Tehran"),
            })
          : "";
    body = [ref, until].filter(Boolean).join("\n");
  } else if (payment?.status === "FAILED" && payment.errorCode == null) {
    title = t("cancelledTitle");
    body = t("cancelledBody");
  } else if (payment?.status === "FAILED") {
    title = t("failedTitle");
    body = t("failedBody");
  } else if (payment?.status === "PENDING") {
    title = t("pendingTitle");
    body = t("pendingBody");
  }

  const showAgain = payment?.status !== "PAID";

  return (
    <section className="mt-4 rounded-card border border-line bg-surface p-4">
      <h1 className="text-[22px] font-bold leading-snug">{title}</h1>
      <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-muted">{body}</p>
      <div className="mt-4 flex flex-col gap-2">
        {showAgain ? (
          <Link
            href="/pricing"
            className="flex min-h-14 items-center justify-center rounded-full bg-focus text-[17px] font-bold text-white"
          >
            {t("again")}
          </Link>
        ) : null}
        <Link href="/" className="flex min-h-11 items-center justify-center text-[15px] font-semibold text-focus-ink">
          {t("home")}
        </Link>
      </div>
    </section>
  );
}
