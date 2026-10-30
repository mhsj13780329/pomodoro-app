import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { displayIdentifier } from "../identifier";
import { LogoutButton } from "./logout-button";

export async function UserMenu() {
  const t = await getTranslations("auth");
  const user = await getCurrentUser();

  return (
    <section className="mt-3 rounded-card border border-line bg-surface p-3.5">
      <h2 className="mb-2.5 text-base font-semibold">{t("account")}</h2>
      {user ? (
        <>
          <p className="text-[13px] text-muted">{t("signedInAs")}</p>
          <p dir="ltr" className="mt-1 text-start text-[15px]">
            {displayIdentifier(user)}
          </p>
          <LogoutButton />
        </>
      ) : (
        <Link
          href="/login"
          className="flex min-h-11 items-center text-[15px] font-semibold text-focus-ink"
        >
          {t("loginSync")}
        </Link>
      )}
    </section>
  );
}
