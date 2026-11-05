"use client";

import { useTranslations } from "next-intl";
import { useLayoutEffect, useSyncExternalStore, type CSSProperties } from "react";
import { touchSyncedSettings } from "@/features/timer/store";
import { Link } from "@/i18n/navigation";
import { applyTheme, currentTheme, isFreeTheme, publishTheme, serverTheme, subscribeTheme, THEMES, type ThemeId } from "../theme";

const swatchClass: Record<ThemeId, string> = {
  warm: "bg-swatch-warm",
  night: "bg-swatch-night",
  forest: "bg-swatch-forest",
  ocean: "bg-swatch-ocean",
  dusk: "bg-swatch-dusk",
  rose: "bg-swatch-rose",
  slate: "bg-swatch-slate",
  sand: "bg-swatch-sand",
};

const dotClass: Record<ThemeId, string> = {
  warm: "bg-swatch-warm-dot",
  night: "bg-swatch-night-dot",
  forest: "bg-swatch-forest-dot",
  ocean: "bg-swatch-ocean-dot",
  dusk: "bg-swatch-dusk-dot",
  rose: "bg-swatch-rose-dot",
  slate: "bg-swatch-slate-dot",
  sand: "bg-swatch-sand-dot",
};

const swatchVar: Record<ThemeId, string> = {
  warm: "var(--color-swatch-warm)",
  night: "var(--color-swatch-night)",
  forest: "var(--color-swatch-forest)",
  ocean: "var(--color-swatch-ocean)",
  dusk: "var(--color-swatch-dusk)",
  rose: "var(--color-swatch-rose)",
  slate: "var(--color-swatch-slate)",
  sand: "var(--color-swatch-sand)",
};

function readAppliedTheme() {
  publishTheme(document.documentElement.dataset.theme);
}

export function ThemePicker({ pro = false }: { pro?: boolean }) {
  const t = useTranslations("settings");
  const tTasks = useTranslations("tasks");
  // Server and the first client render both say warm. The cookie is applied
  // before paint, then this catches up so the pressed swatch matches.
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, serverTheme);
  useLayoutEffect(() => {
    readAppliedTheme();
  }, []);

  const names: Record<ThemeId, string> = {
    warm: t("themeWarm"),
    night: t("themeNight"),
    forest: t("themeForest"),
    ocean: t("themeOcean"),
    dusk: t("themeDusk"),
    rose: t("themeRose"),
    slate: t("themeSlate"),
    sand: t("themeSand"),
  };
  const hasLockedThemes = !pro && THEMES.some((id) => !isFreeTheme(id));

  return (
    <div>
      <div className="flex flex-wrap gap-x-3.5 gap-y-4" role="group" aria-label={t("theme")}>
        {THEMES.map((id) => {
          const selected = theme === id;
          const name = names[id];
          // A stored Pro theme stays selected after Pro ends; only switching to one is locked.
          const locked = !pro && !isFreeTheme(id) && !selected;
          const proTheme = !isFreeTheme(id);
          return (
            <div key={id} className="relative">
              <button
                type="button"
                aria-pressed={selected}
                aria-label={selected ? t("themeSelected", { name }) : name}
                disabled={locked}
                onClick={() => {
                  applyTheme(id);
                  touchSyncedSettings();
                }}
                className={`flex size-[52px] items-center justify-center rounded-full border-[3px] p-0 ${
                  locked ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                } ${
                  selected ? "border-ink shadow-[inset_0_0_0_5px_var(--swatch)]" : "border-line"
                } ${swatchClass[id]}`}
                style={{ "--swatch": swatchVar[id] } as CSSProperties}
              >
                <span className={`size-6 rounded-full ${dotClass[id]}`} />
              </button>
              {proTheme ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -bottom-2.5 left-1/2 -translate-x-1/2 rounded-full bg-pro-bg px-1.5 text-[10px] font-bold leading-4 text-pro-ink"
                >
                  {t("proBadge")}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      {hasLockedThemes ? (
        <Link href="/pricing" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold underline">
          {tTasks("upgrade")}
        </Link>
      ) : null}
    </div>
  );
}
