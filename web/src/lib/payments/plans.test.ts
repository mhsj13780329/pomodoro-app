import { describe, expect, it } from "vitest";
import { getPlan, PLAN_IDS } from "./plans";

describe("getPlan", () => {
  it("returns the server amount for each plan id", () => {
    for (const id of PLAN_IDS) {
      const plan = getPlan(id);
      expect(plan?.id).toBe(id);
      expect(plan?.amountToman).toBeGreaterThan(0);
    }
  });

  it("rejects an unknown id, including a client-supplied amount", () => {
    expect(getPlan("WEEK")).toBeNull();
    expect(getPlan("")).toBeNull();
    expect(getPlan("month")).toBeNull();
    expect(getPlan("YEAR:1")).toBeNull();
  });
});
