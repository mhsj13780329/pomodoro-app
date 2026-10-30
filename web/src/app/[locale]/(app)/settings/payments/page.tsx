import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { IconChevron } from "@/components/icons";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/current-user";
import { formatCode, formatDate, formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";

const PLAN_KEY = { MONTH: "month", YEAR: "year", LIFETIME: "lifetime" } as const;

export default async function PaymentHistoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("settings.payments");
  const back = await getTranslations("pricing");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col pb-6">
      <div className="flex min-h-11 items-center gap-1">
        <Link href="/settings" aria-label={back("back")} className="-ms-2.5 flex size-11 items-center justify-center">
          <IconChevron className="size-6 ltr:-scale-x-100" />
        </Link>
        <h1 className="text-[22px] font-bold">{t("title")}</h1>
      </div>
      {/* The session is request data, so the list waits inside Suspense. */}
      <Suspense fallback={<div className="mt-3 min-h-24 rounded-card border border-line bg-surface" />}>
        <PaymentList locale={locale} />
      </Suspense>
    </div>
  );
}

async function PaymentList({ locale }: { locale: Locale }) {
  const session = await getCurrentUser();
  if (!session) redirect(`/${locale}/login?next=/settings/payments`);

  // userId comes from the session, never from the query, so a user cannot list someone else's rows.
  const rows = await prisma.payment.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      plan: true,
      amountToman: true,
      status: true,
      refId: true,
      createdAt: true,
    },
  });
  const account = await prisma.user.findUnique({
    where: { id: session.id },
    select: { timezone: true },
  });
  const t = await getTranslations("settings.payments");
  const plans = await getTranslations("pricing.plans");
  const price = await getTranslations("pricing");
  const zone = account?.timezone || "Asia/Tehran";

  if (rows.length === 0) {
    return <p className="mt-4 text-[15px] text-muted">{t("empty")}</p>;
  }

  return (
    <ul className="mt-3 flex list-none flex-col gap-2 p-0">
      {rows.map((row) => (
        <li key={row.id} className="rounded-card border border-line bg-surface px-3.5 py-3">
          <p className="text-[13px] text-muted">{formatDate(row.createdAt, locale, zone)}</p>
          <p className="mt-1 text-[15px] font-semibold">{plans(`${PLAN_KEY[row.plan]}.name`)}</p>
          <p className="text-[15px]">{price("price", { amount: formatNumber(row.amountToman, locale) })}</p>
          <p className="text-[13px] text-muted">{t(`status.${row.status}`)}</p>
          {row.refId ? (
            <p dir="ltr" className="text-start text-[13px] text-muted">
              {t("ref", { ref: formatCode(row.refId, locale) })}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
