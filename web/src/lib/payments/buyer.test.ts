import { describe, expect, it } from "vitest";
import { gatewayEmail, gatewayMobile } from "./buyer";

describe("gateway contact", () => {
  it("sends an Iranian mobile as 09…", () => {
    expect(gatewayMobile("+989121234567")).toBe("09121234567");
    expect(gatewayMobile("+14155552671")).toBeUndefined();
    expect(gatewayMobile(null)).toBeUndefined();
  });

  it("skips the synthetic phone email", () => {
    expect(gatewayEmail("989121234567@phone.pomodoro.invalid")).toBeUndefined();
    expect(gatewayEmail("ada@example.com")).toBe("ada@example.com");
  });
});
