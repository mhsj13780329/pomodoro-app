"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { IconCheck, IconChevron } from "@/components/icons";
import { useRouter } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { getPlan, PLAN_IDS, type PlanId } from "@/lib/payments/plans";

const PLAN_KEY = { MONTH: "month", YEAR: "year", LIFETIME: "lifetime" } as const;

const GATEWAY_HOSTS = new Set(["sandbox.zarinpal.com", "payment.zarinpal.com"]);
function allowedPayUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (GATEWAY_HOSTS.has(url.hostname)) return url.pathname.startsWith("/pg/StartPay/");
  return url.origin === window.location.origin && url.pathname === "/api/test/pay";
}

export function PricingForm({
  signedIn,
  initialPlan,
}: {
  signedIn: boolean;
  initialPlan: PlanId;
}) {
  const t = useTranslations("pricing");
  const locale = useLocale();
  const router = useRouter();
  const [selected, setSelected] = useState<PlanId>(initialPlan);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"gateway" | "unavailable" | null>(null);

  async function pay(plan: PlanId) {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(`/pricing?plan=${plan}`)}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/payments/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (response.status === 401) {
        router.push(`/login?next=${encodeURIComponent(`/pricing?plan=${plan}`)}`);
        return;
      }
      const body = (await response.json().catch(() => null)) as { url?: unknown; error?: unknown } | null;
      const url = typeof body?.url === "string" ? body.url : "";
      if (!response.ok || !allowedPayUrl(url)) {
        setError(body?.error === "unavailable" ? "unavailable" : "gateway");
        setBusy(false);
        return;
      }
      window.location.assign(url);
    } catch {
      setError("unavailable");
      setBusy(false);
    }
  }

  const selectedOffer = getPlan(selected);
  const price = (id: PlanId) => t("price", { amount: formatNumber(getPlan(id)?.amountToman ?? 0, locale) });

  return (
    <form
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void pay(selected);
      }}
    >
      <section aria-labelledby="plans-h" className="mt-8">
        <h2 id="plans-h" className="text-[22px] font-bold">{t("plansTitle")}</h2>
        <fieldset className="m-0 mt-4 min-w-0 border-0 p-0">
          <legend className="sr-only">{t("legend")}</legend>
          <div className="grid gap-4 md:grid-cols-3">
            {PLAN_IDS.map((id) => {
              const checked = id === selected;
              return (
                <label
                  key={id}
                  className={`flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-panel border-2 bg-surface px-5 pb-5 pt-6 ${
                    checked ? "border-focus" : "border-line"
                  }`}
                >
                  <span className="flex min-h-11 items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-3 text-lg font-bold">
                      <input
                        type="radio"
                        name="plan"
                        value={id}
                        checked={checked}
                        onChange={() => setSelected(id)}
                        className="size-6 shrink-0 accent-focus"
                      />
                      {t(`plans.${PLAN_KEY[id]}.name`)}
                    </span>
                    {id === "YEAR" ? (
                      <span className="rounded-pill bg-focus px-3 py-0.5 text-xs font-semibold text-white">
                        {t("recommended")}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[26px] font-bold leading-relaxed">{price(id)}</span>
                  <span className="text-sm leading-relaxed text-muted">{t(`plans.${PLAN_KEY[id]}.hint`)}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-5 flex flex-col gap-4 rounded-panel border border-line bg-surface p-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="text-[13px] text-muted">{t("selected")}</div>
            <div className="text-[17px] font-semibold">
              {t(`plans.${PLAN_KEY[selected]}.name`)} · {selectedOffer ? price(selected) : ""}
            </div>
            <div className="mt-1 text-[13px] text-muted">{t("oneOff")}</div>
          </div>
          <div className="flex flex-col items-stretch gap-2">
            <button
              type="submit"
              disabled={busy}
              className="min-h-14 cursor-pointer rounded-control bg-focus px-8 text-base font-semibold text-white disabled:opacity-60"
            >
              {busy ? t("paying") : t("pay")}
            </button>
            <span className="text-center text-xs text-muted">{t("secure")}</span>
          </div>
        </div>
        <div className="mx-auto mt-3 flex h-14 w-[120px] items-center justify-center rounded-tab border border-dashed border-line-strong text-center text-xs text-muted">
          {t("enamad")}
        </div>
        <p role="alert" className="mt-2 min-h-6 text-center text-[13px] text-focus">
          {error ? t(`errors.${error}`) : ""}
        </p>
      </section>

      <Comparison />
      <Faq />
      <FinalCta />
    </form>
  );
}

const COMPARE = ["timer", "autostart", "sync", "streak", "themes", "tasks", "stats", "notepad", "ambient"] as const;

function Comparison() {
  const t = useTranslations("pricing.compare");
  return (
    <section aria-labelledby="cmp-h" className="mt-12">
      <h2 id="cmp-h" className="text-[22px] font-bold">{t("title")}</h2>
      <p className="mb-5 mt-1.5 text-muted">{t("lead")}</p>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {COMPARE.map((id) => (
          <li
            key={id}
            className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 md:flex-row md:items-stretch md:gap-4"
          >
            <h3 className="m-0 text-base font-semibold md:flex md:w-1/4 md:items-center">{t(`${id}.label`)}</h3>
            <div className="grid flex-1 gap-2 md:grid-cols-2">
              <div className="rounded-nav bg-ground px-3.5 py-2.5">
                <div className="text-xs font-semibold text-muted">{t("free")}</div>
                <div className="flex items-start gap-2 text-sm leading-relaxed">
                  {id === "notepad" ? (
                    <svg viewBox="0 0 24 24" className="mt-1 size-[18px] shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                      <line x1="6" y1="12" x2="18" y2="12" />
                    </svg>
                  ) : (
                    <IconCheck className="mt-1 size-[18px] shrink-0 text-short" />
                  )}
                  <span className={id === "notepad" ? "text-muted" : ""}>{t(`${id}.free`)}</span>
                </div>
              </div>
              <div className="rounded-nav bg-pro-bg px-3.5 py-2.5">
                <div className="text-xs font-semibold text-pro-ink">{t("pro")}</div>
                <div className="flex items-start gap-2 text-sm leading-relaxed">
                  <IconCheck className="mt-1 size-[18px] shrink-0 text-pro-ink" />
                  <span>{t(`${id}.pro`)}</span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 rounded-card bg-focus-soft px-5 py-4 text-[15px] font-medium leading-loose text-focus-ink">
        {t("retention")}
      </p>
    </section>
  );
}

const FAQ = ["renew", "after", "lifetime", "pay"] as const;

function Faq() {
  const t = useTranslations("pricing.faq");
  return (
    <section aria-labelledby="faq-h" className="mx-auto mt-12 w-full max-w-[760px]">
      <h2 id="faq-h" className="mb-4 text-[22px] font-bold">{t("title")}</h2>
      <div className="flex flex-col gap-2.5">
        {FAQ.map((id) => (
          <details key={id} className="group rounded-card border border-line bg-surface px-5">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 text-base font-semibold [&::-webkit-details-marker]:hidden">
              {t(`${id}.q`)}
              <IconChevron className="size-5 shrink-0 rotate-90 text-muted group-open:-rotate-90" />
            </summary>
            <p className="mb-4 mt-0 leading-loose text-muted">{t(`${id}.a`)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  const t = useTranslations("pricing.cta");
  return (
    <section className="mt-12 flex flex-col items-center gap-3 rounded-feature border border-line bg-surface px-5 py-10 text-center">
      <h2 className="text-2xl font-bold leading-relaxed">{t("title")}</h2>
      <p className="max-w-[480px] text-muted">{t("body")}</p>
      <a
        href="#plans-h"
        className="mt-1 inline-flex min-h-14 items-center justify-center rounded-control bg-focus px-8 text-base font-semibold text-white"
      >
        {t("button")}
      </a>
    </section>
  );
}
