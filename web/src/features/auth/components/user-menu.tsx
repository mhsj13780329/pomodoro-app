import { getTranslations } from "next-intl/server";
import { SyncStatus } from "@/features/settings/components/sync-status";
import { cardClass } from "@/features/settings/card";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { displayIdentifier } from "../identifier";
import { LogoutButton } from "./logout-button";

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-7">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** The account card: who is signed in, their plan and sync, and the account actions. */
export async function UserMenu({ loadPro }: { loadPro: () => Promise<boolean> }) {
  const t = await getTranslations("auth");
  const settings = await getTranslations("settings");
  const tasks = await getTranslations("tasks");
  const user = await getCurrentUser();
  const pro = await loadPro();
  // A real name's first letter; phone numbers and emails get the generic icon.
  const initial = user?.name?.trim().match(/^\p{L}/u)?.[0];

  return (
    <section className={cardClass} aria-label={t("account")}>
      <div className="flex items-center gap-3.5">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-focus-soft text-2xl font-bold text-focus-ink md:size-[60px]">
          {initial ?? <PersonIcon />}
        </span>
        <div className="min-w-0 flex-1">
          {user ? (
            <>
              <p dir="ltr" className="truncate text-start text-[17px] font-bold rtl:text-end">
                {displayIdentifier(user)}
              </p>
              <p className="mt-0.5 text-[13px] text-muted">
                {settings(pro ? "planPro" : "planFree")}
                <SyncStatus />
              </p>
            </>
          ) : (
            <>
              <p className="text-[17px] font-bold">{t("account")}</p>
              <Link href="/login" className="mt-0.5 inline-flex min-h-8 items-center text-[13px] font-semibold text-focus-ink">
                {t("loginSync")}
              </Link>
            </>
          )}
        </div>
        {pro ? null : (
          <Link
            href="/pricing"
            className="flex min-h-11 shrink-0 items-center rounded-pill bg-focus px-4 text-sm font-bold text-white md:hidden"
          >
            {tasks("upgrade")}
          </Link>
        )}
      </div>
      {user ? (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-1">
          <Link href="/settings/payments" className="flex min-h-11 items-center text-sm font-semibold text-focus-ink">
            {settings("payments.title")}
          </Link>
          <LogoutButton />
        </div>
      ) : null}
    </section>
  );
}
