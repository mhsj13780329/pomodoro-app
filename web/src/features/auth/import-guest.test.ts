import { describe, expect, it } from "vitest";
import { guestTasksOf } from "@/features/tasks/store";
import { guestImportOf } from "@/features/timer/store";
import { importBodySchema } from "@/lib/import/contract";
import type { TaskWire } from "@/lib/tasks/contract";

const timer = {
  focusSec: 25 * 60,
  shortBreakSec: 5 * 60,
  longBreakSec: 15 * 60,
  longBreakEvery: 4,
  autoStartFocus: false,
  autoStartShortBreak: true,
  autoStartLongBreak: true,
  completedSessions: [],
};

const ID = "3f1c2b4a-0000-4000-8000-000000000001";

describe("guestImportOf", () => {
  it("sends minutes, wire phases and plannedSec", () => {
    const { settings, sessions } = guestImportOf(
      {
        ...timer,
        focusSec: 90,
        longBreakEvery: 30,
        completedSessions: [
          { id: ID, phase: "focus", startedAt: 1_000_000, endedAt: 1_000_000 + 1500_000, durationSec: 1500, completed: true, taskId: "t1" },
          { id: ID, phase: "focus", startedAt: 5, endedAt: 5, durationSec: 10, completed: true, taskId: null },
          { id: ID, phase: "focus", startedAt: 5, endedAt: 50, durationSec: 0, completed: true, taskId: null },
        ],
      },
      "night",
    );
    expect(settings).toMatchObject({ focusMin: 2, shortBreakMin: 5, longBreakEvery: 20, themeId: "night" });
    expect(sessions).toEqual([
      {
        id: ID,
        phase: "focus",
        startedAt: new Date(1_000_000).toISOString(),
        endedAt: new Date(2_500_000).toISOString(),
        durationSec: 1500,
        plannedSec: 1500,
        completed: true,
        taskId: "t1",
      },
    ]);
  });

  it("clamps minutes to 1..1440 and passes the contract", () => {
    const { settings, sessions } = guestImportOf({ ...timer, focusSec: 5, longBreakSec: 10 ** 7 }, "warm");
    expect(settings.focusMin).toBe(1);
    expect(settings.longBreakMin).toBe(1440);
    expect(importBodySchema.safeParse({ settings, sessions, tasks: [] }).success).toBe(true);
  });
});

function task(id: string, patch: Partial<TaskWire> = {}): TaskWire {
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

function byId(...tasks: TaskWire[]): Record<string, TaskWire> {
  return Object.fromEntries(tasks.map((item) => [item.id, item]));
}

describe("guestTasksOf", () => {
  it("returns nothing once an account owns the tasks", () => {
    expect(guestTasksOf({ ownerId: "u1", tasks: byId(task("a")) })).toEqual([]);
  });

  it("drops deleted tasks and subtasks, and keeps only the wire fields", () => {
    const list = guestTasksOf({
      ownerId: null,
      tasks: byId(
        task("a", { notes: "private", estimatePomodoros: 3 }),
        task("b", { deletedAt: "2026-10-31T00:00:00.000Z" }),
        task("c", { parentId: "a" }),
      ),
    });
    expect(list.map((item) => item.id)).toEqual(["a"]);
    expect(Object.keys(list[0]!).sort()).toEqual(["createdAt", "doneAt", "done", "id", "order", "title", "updatedAt"].sort());
  });

  it("lists unfinished first, then the newest finished, at most 500", () => {
    const tasks = [
      task("old-done", { done: true, doneAt: "x", updatedAt: "2026-10-01T00:00:00.000Z" }),
      task("new-done", { done: true, doneAt: "x", updatedAt: "2026-10-20T00:00:00.000Z" }),
      task("open", { updatedAt: "2026-09-01T00:00:00.000Z" }),
    ];
    expect(guestTasksOf({ ownerId: null, tasks: byId(...tasks) }).map((item) => item.id)).toEqual([
      "open",
      "new-done",
      "old-done",
    ]);
    const many = Array.from({ length: 520 }, (_, index) => task(`t${index}`));
    expect(guestTasksOf({ ownerId: null, tasks: byId(...many) })).toHaveLength(500);
  });
});
