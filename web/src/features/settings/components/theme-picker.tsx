"use client";

import { useTranslations } from "next-intl";
import { useLayoutEffect, useSyncExternalStore, type CSSProperties } from "react";
import { touchSyncedSettings } from "@/features/timer/store";
import { applyTheme, currentTheme, publishTheme, serverTheme, subscribeTheme, THEMES, type ThemeId } from "../theme";

const swatchClass: Record<ThemeId, string> = {
  warm: "bg-swatch-warm",
  night: "bg-swatch-night",
  forest: "bg-swatch-forest",
};

const dotClass: Record<ThemeId, string> = {
  warm: "bg-swatch-warm-dot",
  night: "bg-swatch-night-dot",
  forest: "bg-swatch-forest-dot",
};

const swatchVar: Record<ThemeId, string> = {
  warm: "var(--color-swatch-warm)",
  night: "var(--color-swatch-night)",
  forest: "var(--color-swatch-forest)",
};

function readAppliedTheme() {
  publishTheme(document.documentElement.dataset.theme);
}

export function ThemePicker() {
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
  };

  return (
    <div className="flex gap-3.5" role="group" aria-label={t("theme")}>
      {THEMES.map((id) => {
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
            className={`flex size-[52px] cursor-pointer items-center justify-center rounded-full border-[3px] p-0 ${
              selected ? "border-ink shadow-[inset_0_0_0_5px_var(--swatch)]" : "border-line"
            } ${swatchClass[id]}`}
            style={{ "--swatch": swatchVar[id] } as CSSProperties}
          >
            <span className={`size-6 rounded-full ${dotClass[id]}`} />
          </button>
        );
      })}
    </div>
  );
}
