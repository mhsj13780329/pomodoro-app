"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { IconCheck } from "@/components/icons";
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

  return (
    <form
      className="mt-4 flex flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        const selected = String(new FormData(event.currentTarget).get("plan"));
        const plan: PlanId = selected === "MONTH" || selected === "LIFETIME" ? selected : "YEAR";
        void pay(plan);
      }}
    >
      <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0 pt-3">
        <legend className="sr-only">{t("legend")}</legend>
        {PLAN_IDS.map((id) => {
          const offer = getPlan(id);
          const recommended = id === "YEAR";
          return (
            <label
              key={id}
              className={`relative flex min-h-[72px] cursor-pointer items-center gap-3 rounded-sheet bg-surface px-3.5 ${
                recommended ? "border-2 border-focus" : "border border-line"
              }`}
            >
              {recommended ? (
                <span className="absolute -top-3 end-3.5 flex min-h-6 items-center rounded-tab bg-focus px-2.5 text-xs font-semibold text-white">
                  {t("recommended")}
                </span>
              ) : null}
              <input
                type="radio"
                name="plan"
                value={id}
                defaultChecked={id === initialPlan}
                className="size-[22px] shrink-0 accent-focus"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-base font-semibold">{t(`plans.${PLAN_KEY[id]}.name`)}</span>
                <span className="text-[13px] text-muted">{t(`plans.${PLAN_KEY[id]}.hint`)}</span>
              </span>
              <span className="text-[15px] font-semibold">
                {t("price", { amount: formatNumber(offer?.amountToman ?? 0, locale) })}
              </span>
            </label>
          );
        })}
      </fieldset>

      <FeatureList />
      <Comparison />

      <button
        type="submit"
        disabled={busy}
        className="mt-6 min-h-14 cursor-pointer rounded-full bg-focus text-[17px] font-bold text-white disabled:opacity-60"
      >
        {busy ? t("paying") : t("pay")}
      </button>
      <p className="mt-2.5 text-center text-[13px] leading-relaxed text-muted">{t("note")}</p>
      <div className="mx-auto mt-3 flex h-14 w-[120px] items-center justify-center rounded-tab border border-dashed border-line-strong text-center text-xs text-muted">
        {t("enamad")}
      </div>
      <p role="alert" className="mt-2 min-h-6 text-center text-[13px] text-focus">
        {error ? t(`errors.${error}`) : ""}
      </p>
    </form>
  );
}

const FEATURES = ["themes", "tasks", "stats", "sounds", "ambient", "notes"] as const;

function FeatureList() {
  const t = useTranslations("pricing");
  return (
    <ul className="mt-4 flex list-none flex-col gap-1 p-0">
      {FEATURES.map((id) => (
        <li key={id} className="flex min-h-9 items-center gap-2.5 text-[15px]">
          <IconCheck className="size-5 shrink-0 text-short" />
          <span>{t(`features.${id}`)}</span>
        </li>
      ))}
    </ul>
  );
}

const COMPARE = ["timer", "autostart", "sync", "streak", "themes", "tasks", "stats", "notepad", "ambient"] as const;

function Comparison() {
  const t = useTranslations("pricing.compare");
  return (
    <section className="mt-4">
      <h2 className="text-base font-semibold">{t("title")}</h2>
      <ul className="mt-2 flex list-none flex-col gap-2 p-0">
        {COMPARE.map((id) => (
          <li key={id} className="rounded-sheet border border-line bg-surface px-3.5 py-2.5">
            <p className="text-[15px] font-semibold">{t(`${id}.label`)}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              {t("free")}: {t(`${id}.free`)}
            </p>
            <p className="text-[13px] leading-relaxed">
              {t("pro")}: {t(`${id}.pro`)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
