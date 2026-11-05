"use client";

import { useTranslations } from "next-intl";
import { unsubscribePush } from "@/features/push/use-push-subscription";
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
          await unsubscribePush(); // needs the session cookie, so before signOut
          await wipeDevice();
          useTimerStore.getState().resetGuest();
          useTasksStore.getState().reset();
          await authClient.signOut();
          router.refresh();
        })();
      }}
      className="min-h-11 cursor-pointer rounded-pill border border-line-strong bg-transparent px-4 text-sm font-semibold text-ink"
    >
      {t("logout")}
    </button>
  );
}
