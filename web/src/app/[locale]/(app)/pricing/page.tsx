import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { IconCheck, IconChevron, IconCrown } from "@/components/icons";
import { PricingForm } from "@/features/pricing/components/pricing-form";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/current-user";
import { formatDate } from "@/lib/format";
import { isPlanId, type PlanId } from "@/lib/payments/plans";
import { isProActive } from "@/lib/pro";
import { prisma } from "@/lib/prisma";

const FEATURES = ["themes", "tasks", "stats", "sounds", "ambient", "notes"] as const;

export default async function PricingPage({
  params,
  searchParams,
}: PageProps<"/[locale]/pricing">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("pricing");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col pb-6">
      <div className="flex min-h-11 items-center">
        <Link
          href="/"
          aria-label={t("back")}
          className="-ms-2.5 flex size-11 items-center justify-center"
        >
          {/* Points right. In LTR a back chevron points left, so only LTR flips it. */}
          <IconChevron className="size-6 ltr:-scale-x-100" />
        </Link>
      </div>

      <div className="mt-1">
        <div className="inline-flex min-h-7 items-center gap-1.5 rounded-pill bg-pro-bg px-3 text-[13px] font-semibold text-pro-ink">
          <IconCrown className="size-3.5" />
          <span>{t("badge")}</span>
        </div>
        <h1 className="mt-2.5 text-[26px] font-bold leading-snug">{t("headline")}</h1>
        <p className="mt-1 text-[15px] leading-relaxed text-muted">{t("lead")}</p>
      </div>

      {/* The plan query and the signed-in row are request data. Suspense lets the rest of the page render. */}
      <Suspense fallback={<div className="mt-4 min-h-24" />}>
        <PricingAccount locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function PricingAccount({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: PageProps<"/[locale]/pricing">["searchParams"];
}) {
  const query = await searchParams;
  const requested = typeof query.plan === "string" ? query.plan : "";
  const initialPlan: PlanId = isPlanId(requested) ? requested : "YEAR";
  const t = await getTranslations("pricing");

  const session = await getCurrentUser();
  const account = session
    ? await prisma.user.findUnique({
        where: { id: session.id },
        select: { proUntil: true, proLifetime: true, timezone: true },
      })
    : null;
  const lifetime = account?.proLifetime === true;
  const until = account?.proUntil ?? null;
  const pro = account ? isProActive({ proUntil: until, proLifetime: lifetime }) : false;
  const status = lifetime
    ? t("statusLifetime")
    : pro && until
      ? t("statusUntil", { date: formatDate(until, locale, account?.timezone ?? "Asia/Tehran") })
      : t("statusFree");

  return (
    <>
      <p className="mt-3 text-[15px] font-semibold">{status}</p>
      {lifetime ? (
        <LifetimeThanks />
      ) : (
        <PricingForm signedIn={session != null} initialPlan={initialPlan} />
      )}
    </>
  );
}

async function LifetimeThanks() {
  const t = await getTranslations("pricing");
  return (
    <div className="mt-4">
      <section className="rounded-card border border-line bg-surface p-3.5">
        <h2 className="text-base font-semibold">{t("thanksTitle")}</h2>
        <p className="mt-1 text-[15px] leading-relaxed text-muted">{t("thanksBody")}</p>
      </section>
      <ul className="mt-4 flex list-none flex-col gap-1 p-0">
        {FEATURES.map((id) => (
          <li key={id} className="flex min-h-9 items-center gap-2.5 text-[15px]">
            <IconCheck className="size-5 shrink-0 text-short" />
            <span>{t(`features.${id}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
