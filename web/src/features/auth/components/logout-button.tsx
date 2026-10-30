"use client";

import { useTranslations } from "next-intl";
import { useTasksStore } from "@/features/tasks/store";
import { useTimerStore } from "@/features/timer/store";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { flushForLogout, wipeDevice } from "@/lib/sync/engine";

export function LogoutButton() {
  const t = useTranslations("auth");
  const sync = useTranslations("settings.sync");
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        void (async () => {
          const waiting = await flushForLogout();
          if (waiting > 0 && !window.confirm(sync("logoutWarning", { count: waiting }))) return;
          await wipeDevice();
          useTimerStore.getState().resetGuest();
          useTasksStore.getState().reset();
          await authClient.signOut();
          router.refresh();
        })();
      }}
      className="mt-3 min-h-11 cursor-pointer rounded-control border border-line-strong bg-surface px-4 text-[15px] font-semibold text-ink"
    >
      {t("logout")}
    </button>
  );
}
