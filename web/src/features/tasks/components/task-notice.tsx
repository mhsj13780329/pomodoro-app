"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FREE_ACTIVE_LIMIT } from "@/lib/tasks/contract";
import { useTasksStore } from "../store";

/**
 * Why the last write was refused (the server said no, or the local check did).
 * Not an error toast: it sits in the page, can be dismissed, and links to Pricing.
 */
export function TaskNotice() {
  const t = useTranslations("tasks");
  const notice = useTasksStore((state) => state.notice);
  if (!notice) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 rounded-nav border border-line-strong bg-pro-bg px-3.5 py-1 text-sm text-pro-ink"
    >
      <p className="min-w-0 flex-1 py-2">
        {notice === "active_limit" ? t("noticeLimit", { limit: FREE_ACTIVE_LIMIT }) : t("noticePro")}
      </p>
      <Link href="/pricing" className="flex min-h-11 items-center font-semibold underline">
        {t("upgrade")}
      </Link>
      <button
        type="button"
        onClick={() => useTasksStore.getState().dismissNotice()}
        className="min-h-11 cursor-pointer border-0 bg-transparent px-1 text-sm font-medium text-pro-ink"
      >
        {t("dismiss")}
      </button>
    </div>
  );
}
