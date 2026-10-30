import { describe, expect, it } from "vitest";
import { reminderText } from "./reminder-copy";
import { expiryBannerKind, reminderKind, reminderTarget } from "./reminders";

const NOW = new Date("2026-10-30T12:00:00Z");
const ZONE = "Asia/Tehran";

describe("reminderKind", () => {
  it("picks the local day three days out, and yesterday", () => {
    expect(reminderKind(new Date("2026-11-02T08:00:00Z"), ZONE, NOW)).toBe("EXPIRING");
    expect(reminderKind(new Date("2026-10-29T12:00:00Z"), ZONE, NOW)).toBe("EXPIRED");
    expect(reminderKind(new Date("2026-10-31T12:00:00Z"), ZONE, NOW)).toBeNull();
    expect(reminderKind(new Date("2026-11-06T12:00:00Z"), ZONE, NOW)).toBeNull();
  });
});

describe("expiryBannerKind", () => {
  it("warns inside 7 days, stays quiet after that window, and notes an ended plan", () => {
    const now = NOW.getTime();
    expect(expiryBannerKind(new Date(now + 3 * 86_400_000), false, now)).toBe("soon");
    expect(expiryBannerKind(new Date(now + 7 * 86_400_000), false, now)).toBe("soon");
    expect(expiryBannerKind(new Date(now + 8 * 86_400_000), false, now)).toBeNull();
    expect(expiryBannerKind(new Date(now - 86_400_000), false, now)).toBe("expired");
    expect(expiryBannerKind(new Date(now - 86_400_000), true, now)).toBeNull();
    expect(expiryBannerKind(null, false, now)).toBeNull();
  });
});

describe("reminderTarget", () => {
  it("texts a phone account and mails an email account", () => {
    expect(reminderTarget({ phoneNumber: "+989121234567", email: "989121234567@phone.pomodoro.invalid" })).toEqual({
      channel: "SMS",
      to: "+989121234567",
    });
    expect(reminderTarget({ phoneNumber: null, email: "ada@example.com" })).toEqual({
      channel: "EMAIL",
      to: "ada@example.com",
    });
    expect(reminderTarget({ phoneNumber: null, email: "989121234567@phone.pomodoro.invalid" })).toBeNull();
  });
});

describe("reminderText", () => {
  it("uses the Farsi catalog for fa and does not leave the key untranslated", () => {
    expect(reminderText("fa", "EXPIRING")).toContain("سه روز");
    expect(reminderText("en", "EXPIRED")).toContain("yesterday");
  });
});
