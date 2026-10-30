"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { subscribeSync, syncView, type SyncView } from "@/lib/sync/status";

const GUEST_VIEW: SyncView = { kind: "guest" };

function guestView(): SyncView {
  return GUEST_VIEW;
}

export function SyncStatus() {
  const t = useTranslations("settings.sync");
  const status = useSyncExternalStore(subscribeSync, syncView, guestView);
  if (status.kind === "guest") return null;
  const label =
    status.kind === "offline"
      ? t("offline", { count: status.waiting })
      : status.kind === "syncing"
        ? t("syncing")
        : t("synced");
  return (
    <p className="mt-2 text-xs text-muted" role="status">
      {label}
    </p>
  );
}
