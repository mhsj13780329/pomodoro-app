import { describe, expect, it } from "vitest";
import { waitingCountOf } from "./status";

describe("waiting count", () => {
  it("counts one finished focus as one item", () => {
    expect(waitingCountOf([{ action: "complete" }], [{}])).toBe(1);
  });

  it("counts a pause and a finished focus separately", () => {
    expect(waitingCountOf([{ action: "pause" }, { action: "complete" }], [{}])).toBe(2);
  });

  it("counts waiting task rows and a queued task pick", () => {
    expect(waitingCountOf([], [], 3)).toBe(3);
    expect(waitingCountOf([{ action: "setTask" }], [], 2)).toBe(3);
  });
});
