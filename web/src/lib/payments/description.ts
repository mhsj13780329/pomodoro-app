import { createTranslator } from "use-intl";
import { defaultLocale, isLocale, type Locale } from "@/i18n/routing";
import de from "../../../messages/de.json";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import fa from "../../../messages/fa.json";
import fr from "../../../messages/fr.json";
import ja from "../../../messages/ja.json";
import ko from "../../../messages/ko.json";

const catalogs = { fa, en, es, fr, de, ja, ko };

/** Shown on the bank page. Comes from the message catalogs, not a string in the route. */
export function gatewayDescription(locale: string): string {
  const current: Locale = isLocale(locale) ? locale : defaultLocale;
  const t = createTranslator({
    locale: current,
    messages: catalogs[current],
    namespace: "pricing",
  });
  return t("gatewayDescription");
}
