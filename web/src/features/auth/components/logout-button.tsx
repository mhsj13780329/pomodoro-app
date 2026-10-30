"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

export function LogoutButton() {
  const t = useTranslations("auth");
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        void authClient.signOut().then(() => {
          router.refresh();
        });
      }}
      className="mt-3 min-h-11 cursor-pointer rounded-control border border-line-strong bg-surface px-4 text-[15px] font-semibold text-ink"
    >
      {t("logout")}
    </button>
  );
}
