import { describe, expect, it } from "vitest";
import { localeRedirectPath } from "./routing";

describe("locale redirect", () => {
  it("sends / to /fa when nothing is saved", () => {
    expect(localeRedirectPath("/", undefined)).toBe("/fa");
  });

  it("sends / to the saved locale and does not read Accept-Language", () => {
    expect(localeRedirectPath("/", "en")).toBe("/en");
    expect(localeRedirectPath.length).toBe(2);
  });

  it("ignores a cookie that is not a supported locale", () => {
    expect(localeRedirectPath("/", "de-DE")).toBe("/fa");
    expect(localeRedirectPath("/tasks", "nope")).toBe("/fa/tasks");
  });

  it("keeps a path that already has a locale", () => {
    expect(localeRedirectPath("/ja/settings", "en")).toBeNull();
    expect(localeRedirectPath("/fa", undefined)).toBeNull();
  });

  it("prefixes other pages with the saved locale", () => {
    expect(localeRedirectPath("/settings", "ko")).toBe("/ko/settings");
  });
});
