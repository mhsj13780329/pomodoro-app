"use client";

import { useTranslations } from "next-intl";
import { useLayoutEffect, useSyncExternalStore, type CSSProperties } from "react";
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

let current: ThemeId = "warm";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): ThemeId {
  return current;
}

function serverSnapshot(): ThemeId {
  return "warm";
}

function publish(next: ThemeId) {
  current = next;
  for (const listener of listeners) listener();
}

function applyTheme(next: ThemeId) {
  document.documentElement.dataset.theme = next;
  document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  publish(next);
}

function readAppliedTheme() {
  publish(parseTheme(document.documentElement.dataset.theme));
}

export function ThemePicker() {
  const t = useTranslations("settings");
  // Server and the first client render both say warm. The cookie is applied
  // before paint, then this catches up so the pressed swatch matches.
  const theme = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
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
            onClick={() => applyTheme(id)}
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
