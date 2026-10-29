"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

export function LanguageSwitcher() {
  const t = useTranslations("settings");
  const languages = useTranslations("languages");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  function choose(next: Locale) {
    if (next === locale) return;
    router.replace(pathname, { locale: next });
  }

  return (
    <div role="radiogroup" aria-label={t("language")} className="flex flex-col">
      {routing.locales.map((code) => {
        const selected = code === locale;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => choose(code)}
            className={`flex min-h-11 cursor-pointer items-center rounded-nav border-0 bg-transparent px-2 text-start text-[15px] ${
              selected ? "font-semibold text-ink" : "text-muted"
            }`}
          >
            {languages(code)}
          </button>
        );
      })}
    </div>
  );
}
