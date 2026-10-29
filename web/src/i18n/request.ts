import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";
import { routing, type Locale } from "./routing";

const catalogs: Record<Locale, () => Promise<{ default: Record<string, unknown> }>> = {
  fa: () => import("../../messages/fa.json"),
  en: () => import("../../messages/en.json"),
  es: () => import("../../messages/es.json"),
  fr: () => import("../../messages/fr.json"),
  de: () => import("../../messages/de.json"),
  ja: () => import("../../messages/ja.json"),
  ko: () => import("../../messages/ko.json"),
};

export default getRequestConfig(async ({ locale }) => {
  const requested = locale ?? (await rootLocale());
  const current: Locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const messages = (await catalogs[current]()).default;
  return { locale: current, messages };
});
