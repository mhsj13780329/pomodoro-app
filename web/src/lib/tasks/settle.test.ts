import { describe, expect, it } from "vitest";
import type { TaskBatch, TaskBatchResult, TaskWire } from "./contract";
import { settleBatch, type LocalRows } from "./settle";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const T1 = "2026-10-30T10:00:00.000Z";
const T2 = "2026-10-30T11:00:00.000Z";

function task(patch: Partial<TaskWire> = {}): TaskWire {
  return {
    id: ID,
    title: "Task",
    notes: null,
    estimatePomodoros: null,
    done: false,
    doneAt: null,
    order: 0,
    projectId: null,
    parentId: null,
    tagIds: [],
    createdAt: T1,
    updatedAt: T1,
    deletedAt: null,
    ...patch,
  };
}

const rowsOf = (...tasks: TaskWire[]): LocalRows => ({
  tasks: Object.fromEntries(tasks.map((item) => [item.id, item])),
  projects: {},
  tags: {},
});

const batchOf = (...tasks: TaskWire[]): TaskBatch => ({ projects: [], tags: [], tasks });

function answer(
  status: "applied" | "stale" | "rejected",
  serverTasks: TaskWire[] = [],
  reason?: "active_limit" | "pro_required",
): TaskBatchResult {
  return {
    serverNow: 0,
    pro: false,
    results: [{ kind: "task", id: ID, status, reason }],
    rows: { projects: [], tags: [], tasks: serverTasks },
  };
}

describe("settleBatch", () => {
  it("clears the pending mark when the server applied the write", () => {
    const mine = task();
    const settled = settleBatch(rowsOf(mine), { [ID]: T1 }, batchOf(mine), answer("applied"));
    expect(settled.pending).toEqual({});
    expect(settled.rows.tasks[ID]).toEqual(mine);
    expect(settled.refused).toBeNull();
  });

  it("adopts the server row when this write was stale", () => {
    const mine = task({ title: "mine" });
    const theirs = task({ title: "theirs", updatedAt: T2 });
    const settled = settleBatch(rowsOf(mine), { [ID]: T1 }, batchOf(mine), answer("stale", [theirs]));
    expect(settled.rows.tasks[ID]?.title).toBe("theirs");
    expect(settled.pending).toEqual({});
  });

  it("removes the task when the server says it was deleted", () => {
    const mine = task();
    const gone = task({ updatedAt: T2, deletedAt: T2 });
    const settled = settleBatch(rowsOf(mine), { [ID]: T1 }, batchOf(mine), answer("stale", [gone]));
    expect(settled.rows.tasks[ID]).toBeUndefined();
  });

  it("removes a new task the server refused, and reports why", () => {
    const mine = task();
    const settled = settleBatch(rowsOf(mine), { [ID]: T1 }, batchOf(mine), answer("rejected", [], "active_limit"));
    expect(settled.rows.tasks[ID]).toBeUndefined();
    expect(settled.refused).toBe("active_limit");
  });

  it("puts a refused edit back to the server's version", () => {
    const stored = task({ title: "before" });
    const mine = task({ title: "after", estimatePomodoros: 3, updatedAt: T2 });
    const settled = settleBatch(rowsOf(mine), { [ID]: T2 }, batchOf(mine), answer("rejected", [stored], "pro_required"));
    expect(settled.rows.tasks[ID]).toEqual(stored);
    expect(settled.refused).toBe("pro_required");
  });

  it("leaves a row alone when this device edited it again after the flush started", () => {
    const sentVersion = task({ title: "first", updatedAt: T1 });
    const newer = task({ title: "second", updatedAt: T2 });
    const theirs = task({ title: "server", updatedAt: T1 });
    const settled = settleBatch(rowsOf(newer), { [ID]: T2 }, batchOf(sentVersion), answer("stale", [theirs]));
    expect(settled.rows.tasks[ID]?.title).toBe("second");
    expect(settled.pending).toEqual({ [ID]: T2 });
  });

  it("does not change the rows it was given", () => {
    const local = rowsOf(task());
    settleBatch(local, { [ID]: T1 }, batchOf(task()), answer("rejected", [], "active_limit"));
    expect(local.tasks[ID]).toBeDefined();
  });
});
