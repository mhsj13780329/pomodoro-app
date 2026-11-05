"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconChevron } from "@/components/icons";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { cardClass } from "../card";

/** A one-line card showing the current language; it opens into the list of languages. */
export function LanguageSwitcher() {
  const t = useTranslations("settings");
  const languages = useTranslations("languages");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const listId = useId();

  function choose(next: Locale) {
    setOpen(false);
    if (next === locale) return;
    router.replace(pathname, { locale: next });
  }

  return (
    <section className={`${cardClass} !py-1.5 md:!py-2.5`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent p-0 text-ink"
      >
        <span className="text-base font-bold">{t("language")}</span>
        <span className="flex items-center gap-1.5 text-[15px] text-muted">
          {languages(locale)}
          <IconChevron className={`size-[18px] transition-transform ${open ? "rotate-90" : "rtl:-scale-x-100"}`} />
        </span>
      </button>
      <div
        id={listId}
        role="radiogroup"
        aria-label={t("language")}
        hidden={!open}
        className="mb-1.5 flex-col border-t border-line pt-1.5 [&:not([hidden])]:flex"
      >
        {routing.locales.map((code) => {
          const selected = code === locale;
          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(code)}
              className={`flex min-h-11 cursor-pointer items-center rounded-nav border-0 px-2.5 text-start text-[15px] ${
                selected ? "bg-focus-soft font-semibold text-focus-ink" : "bg-transparent text-ink"
              }`}
            >
              {languages(code)}
            </button>
          );
        })}
      </div>
    </section>
  );
}
