"use client";

import { useTranslations } from "next-intl";
import { Dialog } from "@/components/dialog";
import { IconCheck } from "@/components/icons";
import { Link } from "@/i18n/navigation";
import { FREE_ACTIVE_LIMIT } from "@/lib/tasks/contract";
import { secondaryButton } from "./styles";

/** A free account tapped the locked Projects button: what projects do, and the way to Pro. */
export function ProjectsUpsell({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("tasks");
  const points = [
    t("projectsUpsellPoint1"),
    t("projectsUpsellPoint2"),
    t("projectsUpsellPoint3", { limit: FREE_ACTIVE_LIMIT }),
  ];
  return (
    <Dialog open={open} onClose={onClose} title={t("projectsUpsellTitle")}>
      <div className="flex flex-col gap-4">
        <span className="flex min-h-7 items-center self-start rounded-[14px] bg-pro-bg px-3 text-xs font-bold text-pro-ink">
          {t("proBadge")}
        </span>
        <p className="text-sm leading-loose text-muted">{t("projectsUpsellBody")}</p>
        <ul className="flex flex-col gap-2 text-sm">
          {points.map((point) => (
            <li key={point} className="flex items-center gap-2.5">
              <IconCheck className="size-[18px] shrink-0 text-long" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2">
          <Link
            href="/pricing"
            className="flex min-h-12 items-center justify-center rounded-pill bg-focus text-[15px] font-bold text-white"
          >
            {t("upgrade")}
          </Link>
          <button type="button" onClick={onClose} className={`${secondaryButton} min-h-12 rounded-pill border-0`}>
            {t("projectsUpsellLater")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
