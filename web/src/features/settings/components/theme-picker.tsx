"use client";

import { useTranslations } from "next-intl";
import {
  useLayoutEffect,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { touchSyncedSettings } from "@/features/timer/store";
import { IconLock } from "@/components/icons";
import { Link } from "@/i18n/navigation";
import { cardClass } from "../card";
import {
  applyTheme,
  currentTheme,
  isFreeTheme,
  publishTheme,
  serverTheme,
  subscribeTheme,
  THEMES,
  type ThemeId,
} from "../theme";

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
  // A free account sees the free themes, plus a Pro theme it still has selected after Pro ended.
  const shown = pro
    ? THEMES
    : THEMES.filter((id) => isFreeTheme(id) || id === theme);

  return (
    <section className={cardClass}>
      <h2 className="mb-3 text-base font-bold md:mb-4 md:text-lg">
        {t("theme")}
      </h2>
      <div className="flex flex-wrap items-center gap-3 md:gap-4">
        <div
          className="flex flex-wrap gap-3 md:gap-4"
          role="group"
          aria-label={t("theme")}
        >
          {shown.map((id) => {
            const selected = theme === id;
            const name = names[id];
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                aria-label={selected ? t("themeSelected", { name }) : name}
                onClick={() => {
                  applyTheme(id);
                  touchSyncedSettings();
                }}
                className={`flex size-[52px] cursor-pointer items-center justify-center rounded-full border-[3px] p-0 md:size-14 ${
                  selected
                    ? "border-ink shadow-[inset_0_0_0_5px_var(--swatch)]"
                    : "border-line"
                } ${swatchClass[id]}`}
                style={{ "--swatch": swatchVar[id] } as CSSProperties}
              >
                <span
                  className={`size-6 rounded-full md:size-7 ${dotClass[id]}`}
                />
              </button>
            );
          })}
        </div>
        {pro ? null : (
          <Link
            href="/pricing"
            className="inline-flex min-h-11 basis-full items-center gap-2 rounded-pill text-sm font-bold text-pro-ink md:min-h-12 md:basis-auto md:bg-pro-bg md:px-5"
          >
            <IconLock className="size-4" />
            {t("moreThemes")}
          </Link>
        )}
      </div>
    </section>
  );
}
