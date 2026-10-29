"use client";

import { useTranslations } from "next-intl";
import { useLayoutEffect, useState, type CSSProperties } from "react";
import { THEME_COOKIE, THEMES, type ThemeId, parseTheme } from "../theme";

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

export function ThemePicker() {
  const t = useTranslations("settings");
  // Server and the first client render both say warm. The cookie is applied
  // before paint, then this catches up so the pressed swatch matches.
  const [theme, setTheme] = useState<ThemeId>("warm");
  useLayoutEffect(() => {
    setTheme(parseTheme(document.documentElement.dataset.theme));
  }, []);

  const names: Record<ThemeId, string> = {
    warm: t("themeWarm"),
    night: t("themeNight"),
    forest: t("themeForest"),
  };

  function choose(next: ThemeId) {
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    setTheme(next);
  }

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
            onClick={() => choose(id)}
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
