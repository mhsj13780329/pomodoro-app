import { describe, expect, it } from "vitest";
import type { TaskWire } from "./contract";
import { activeTasks, doneTasks, pickableTask, subtasksOf } from "./select";

let counter = 0;
function task(patch: Partial<TaskWire>): TaskWire {
  counter += 1;
  const id = `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
  return {
    id,
    title: id,
    notes: null,
    estimatePomodoros: null,
    done: false,
    doneAt: null,
    order: 0,
    projectId: null,
    parentId: null,
    tagIds: [],
    createdAt: "2026-10-30T10:00:00.000Z",
    updatedAt: "2026-10-30T10:00:00.000Z",
    deletedAt: null,
    ...patch,
  };
}

const mapOf = (...list: TaskWire[]) => Object.fromEntries(list.map((item) => [item.id, item]));

describe("task views", () => {
  const a = task({ order: 1 });
  const b = task({ order: 0 });
  const finishedEarly = task({ done: true, doneAt: "2026-10-30T11:00:00.000Z" });
  const finishedLate = task({ done: true, doneAt: "2026-10-30T12:00:00.000Z" });
  const removed = task({ deletedAt: "2026-10-30T13:00:00.000Z" });
  const sub = task({ parentId: a.id });
  const all = mapOf(a, b, finishedEarly, finishedLate, removed, sub);

  it("lists active top-level tasks in order, without done, deleted or subtasks", () => {
    expect(activeTasks(all).map((item) => item.id)).toEqual([b.id, a.id]);
  });

  it("lists done tasks, newest first", () => {
    expect(doneTasks(all).map((item) => item.id)).toEqual([finishedLate.id, finishedEarly.id]);
  });

  it("lists the subtasks of one task", () => {
    expect(subtasksOf(all, a.id).map((item) => item.id)).toEqual([sub.id]);
    expect(subtasksOf(all, b.id)).toEqual([]);
  });

  it("only lets a live, unfinished task be picked", () => {
    expect(pickableTask(all, a.id)?.id).toBe(a.id);
    expect(pickableTask(all, finishedLate.id)).toBeNull();
    expect(pickableTask(all, removed.id)).toBeNull();
    expect(pickableTask(all, "missing")).toBeNull();
    expect(pickableTask(all, null)).toBeNull();
  });
});
