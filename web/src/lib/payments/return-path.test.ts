import { describe, expect, it } from "vitest";
import { pricingReturnPath } from "./return-path";

describe("pricingReturnPath", () => {
  it("keeps a pricing return and the selected plan", () => {
    expect(pricingReturnPath("/pricing?plan=YEAR")).toBe("/pricing?plan=YEAR");
    expect(pricingReturnPath("/pricing")).toBe("/pricing");
    expect(pricingReturnPath("/pricing?plan=MONTH")).toBe("/pricing?plan=MONTH");
  });

  it("rejects other paths and other sites", () => {
    expect(pricingReturnPath("/settings")).toBeNull();
    expect(pricingReturnPath("//evil.example/pricing")).toBeNull();
    expect(pricingReturnPath("https://evil.example/pricing")).toBeNull();
    expect(pricingReturnPath("/pricing?plan=WEEK")).toBeNull();
    expect(pricingReturnPath("/pricing?plan=YEAR&next=/settings")).toBeNull();
    expect(pricingReturnPath(null)).toBeNull();
  });
});
