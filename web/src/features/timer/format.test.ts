import { createTranslator } from "use-intl";
import { describe, expect, it } from "vitest";
import { formatClock } from "../../lib/format";
import fa from "../../../messages/fa.json";

describe("Persian formatting", () => {
  it("writes the clock with Persian digits", () => {
    expect(formatClock(16 * 60 + 10, "fa")).toBe("۱۶:۱۰");
    expect(formatClock(3 * 60 + 5, "fa")).toBe("۰۳:۰۵");
  });

  it("writes the session line with Persian digits", () => {
    const t = createTranslator({ locale: "fa", messages: fa });
    expect(t("timer.session", { current: 3, total: 4 })).toBe("جلسه ۳ از ۴");
  });
});
