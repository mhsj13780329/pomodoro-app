import { createTranslator } from "use-intl";
import { defaultLocale, isLocale, type Locale } from "@/i18n/routing";
import de from "../../../messages/de.json";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import fa from "../../../messages/fa.json";
import fr from "../../../messages/fr.json";
import ja from "../../../messages/ja.json";
import ko from "../../../messages/ko.json";
import type { ReminderKindName } from "./reminders";

const catalogs = { fa, en, es, fr, de, ja, ko };

/** The SMS or email body, from the same catalogs as the rest of the UI. */
export function reminderText(locale: string, kind: ReminderKindName): string {
  const current: Locale = isLocale(locale) ? locale : defaultLocale;
  const t = createTranslator({
    locale: current,
    messages: catalogs[current],
    namespace: "pricing",
  });
  return kind === "EXPIRING" ? t("remind.expiring") : t("remind.expired");
}
