import { describe, expect, it } from "vitest";
import { moveTask, nextOrder, sortTasks, type Orderable } from "./order";

function task(id: string, order: number, createdAt = "2026-10-30T10:00:00Z"): Orderable {
  return { id, order, createdAt };
}

describe("sortTasks", () => {
  it("sorts by order, then createdAt, then id", () => {
    const sorted = sortTasks([
      task("c", 1),
      task("b", 0, "2026-10-30T11:00:00Z"),
      task("a", 0, "2026-10-30T10:00:00Z"),
      task("d", 1),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("does not change the input", () => {
    const input = [task("b", 1), task("a", 0)];
    sortTasks(input);
    expect(input.map((item) => item.id)).toEqual(["b", "a"]);
  });
});

describe("nextOrder", () => {
  it("puts a new task after the last one", () => {
    expect(nextOrder([])).toBe(0);
    expect(nextOrder([task("a", 0), task("b", 4)])).toBe(5);
  });
});

describe("moveTask", () => {
  const list = [task("a", 0), task("b", 1), task("c", 2)];

  it("swaps a task with its neighbour and reports only the changed rows", () => {
    expect(moveTask(list, "b", "up")).toEqual([
      { id: "b", order: 0 },
      { id: "a", order: 1 },
    ]);
    expect(moveTask(list, "b", "down")).toEqual([
      { id: "c", order: 1 },
      { id: "b", order: 2 },
    ]);
  });

  it("does nothing at either end or for an unknown id", () => {
    expect(moveTask(list, "a", "up")).toEqual([]);
    expect(moveTask(list, "c", "down")).toEqual([]);
    expect(moveTask(list, "zzz", "up")).toEqual([]);
  });

  it("untangles tasks that share an order number", () => {
    const tied = [task("a", 0, "2026-10-30T10:00:00Z"), task("b", 0, "2026-10-30T11:00:00Z")];
    // a is first by createdAt. Moving b up must put b first: b keeps 0, a has to move to 1.
    expect(moveTask(tied, "b", "up")).toEqual([{ id: "a", order: 1 }]);
  });

  it("works with gaps in the order numbers", () => {
    const gappy = [task("a", 10), task("b", 20), task("c", 30)];
    const changes = moveTask(gappy, "c", "up");
    const result = new Map(gappy.map((item) => [item.id, item.order]));
    for (const change of changes) result.set(change.id, change.order);
    const ids = [...result.entries()].sort((x, y) => x[1] - y[1]).map(([id]) => id);
    expect(ids).toEqual(["a", "c", "b"]);
  });
});
