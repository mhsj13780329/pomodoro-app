import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
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

function lookup(messages: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages);
}

/** The variable names a message uses, including inside plural and select branches. */
function argumentsOf(elements: MessageFormatElement[], into = new Set<string>()): Set<string> {
  for (const element of elements) {
    if (element.type === TYPE.literal || element.type === TYPE.pound) continue;
    into.add(element.value);
    if (element.type === TYPE.plural || element.type === TYPE.select) {
      for (const option of Object.values(element.options)) argumentsOf(option.value, into);
    }
    if (element.type === TYPE.tag) argumentsOf(element.children, into);
  }
  return into;
}

describe("message catalogs", () => {
  it("gives every locale the same keys as Farsi", () => {
    const source = keys(fa).sort();
    for (const [locale, messages] of Object.entries(catalogs)) {
      expect(keys(messages).sort(), locale).toEqual(source);
    }
  });

  it("parses every message as ICU and uses the same placeholders as English", () => {
    for (const key of keys(en)) {
      const source = lookup(en, key);
      if (typeof source !== "string") continue;
      const expected = [...argumentsOf(parse(source))].sort();
      for (const [locale, messages] of Object.entries(catalogs)) {
        const text = lookup(messages, key);
        expect(typeof text, `${locale}: ${key}`).toBe("string");
        let used: string[] = [];
        expect(() => {
          used = [...argumentsOf(parse(text as string))].sort();
        }, `${locale}: ${key} is not valid ICU`).not.toThrow();
        expect(used, `${locale}: ${key} placeholders`).toEqual(expected);
      }
    }
  });
});
