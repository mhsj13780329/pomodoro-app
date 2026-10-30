"use client";

import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";
import { Link } from "@/i18n/navigation";
import { localDay, type BannerKind } from "@/lib/payments/reminders";

function storageKey(timeZone: string): string {
  return `pomodoro-pro-banner:${localDay(new Date(), timeZone)}`;
}

function readDismissed(timeZone: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(timeZone)) === "1";
  } catch {
    return false;
  }
}

/** Shown until the person dismisses it. The dismissal lasts for the local day. */
export function ExpiryBanner({ kind, timeZone }: { kind: BannerKind; timeZone: string }) {
  const t = useTranslations("pricing.banner");
  const [closed, setClosed] = useState(false);
  // Hydration uses the server snapshot (hidden). Then we read today's dismissal.
  const dismissed = useSyncExternalStore(
    () => () => {},
    () => readDismissed(timeZone),
    () => true,
  );

  if (dismissed || closed) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(storageKey(timeZone), "1");
    } catch {
      // Closing it for this view is enough when storage is blocked.
    }
    setClosed(true);
  }

  const gentle = kind === "expired";

  return (
    <div
      className={`mb-3 flex items-center gap-2 rounded-card px-3.5 py-2 ${
        gentle ? "border border-line bg-surface text-muted" : "bg-pro-bg text-pro-ink"
      }`}
    >
      <p className="flex-1 text-[15px] leading-relaxed">
        {t(kind)}{" "}
        <Link href="/pricing" className="inline-flex min-h-11 items-center font-semibold underline">
          {t("renew")}
        </Link>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("dismiss")}
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-lg"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
