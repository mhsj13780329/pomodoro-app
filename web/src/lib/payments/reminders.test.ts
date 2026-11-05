import { describe, expect, it } from "vitest";
import { reminderText } from "./reminder-copy";
import { reminderKind, reminderTarget } from "./reminders";

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
