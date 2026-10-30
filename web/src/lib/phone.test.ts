import { describe, expect, it } from "vitest";
import { normalizeIranMobile, toAsciiDigits } from "./phone";

const E164 = "+989123456789";

describe("toAsciiDigits", () => {
  it("maps Persian and Arabic-Indic digits", () => {
    expect(toAsciiDigits("۰۹۱۲")).toBe("0912");
    expect(toAsciiDigits("٠٩١٢")).toBe("0912");
    expect(toAsciiDigits("ab۱۲")).toBe("ab12");
  });
});

describe("normalizeIranMobile", () => {
  it.each([
    "09123456789",
    "9123456789",
    "989123456789",
    "+989123456789",
    "00989123456789",
    "۰۹۱۲۳۴۵۶۷۸۹",
    "٠٩١٢٣٤٥٦٧٨٩",
    "+98 912-345-6789",
    "(0912) 345 6789",
  ])("accepts %s", (input) => {
    expect(normalizeIranMobile(input)).toEqual({ ok: true, e164: E164 });
  });

  it.each(["", "123", "02112345678", "+14155552671", "08123456789", "+98912"])(
    "rejects %s",
    (input) => {
      expect(normalizeIranMobile(input)).toEqual({ ok: false });
    },
  );
});
