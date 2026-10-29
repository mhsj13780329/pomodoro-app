import { describe, expect, it } from "vitest";
import fa from "../../messages/fa.json";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import fr from "../../messages/fr.json";
import de from "../../messages/de.json";
import ja from "../../messages/ja.json";
import ko from "../../messages/ko.json";

function keys(value: unknown, prefix = ""): string[] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) =>
      keys(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

const catalogs = { fa, en, es, fr, de, ja, ko };

describe("message catalogs", () => {
  it("gives every locale the same keys as Farsi", () => {
    const source = keys(fa).sort();
    for (const [locale, messages] of Object.entries(catalogs)) {
      expect(keys(messages).sort(), locale).toEqual(source);
    }
  });
});
