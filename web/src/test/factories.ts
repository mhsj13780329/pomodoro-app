import type { ProjectWire, TaskWire } from "@/lib/tasks/contract";

const STAMP = "2026-11-01T10:00:00.000Z";

/** A live top-level task with sensible defaults; override what the test cares about. */
export function makeTask(overrides: Partial<TaskWire> & { id: string }): TaskWire {
  return {
    title: `Task ${overrides.id}`,
    notes: null,
    estimatePomodoros: null,
    done: false,
    doneAt: null,
    order: 1,
    projectId: null,
    parentId: null,
    tagIds: [],
    createdAt: STAMP,
    updatedAt: STAMP,
    deletedAt: null,
    ...overrides,
  };
}

/** A live, unarchived project. */
export function makeProject(overrides: Partial<ProjectWire> & { id: string }): ProjectWire {
  return {
    name: `Project ${overrides.id}`,
    color: "focus",
    archived: false,
    createdAt: STAMP,
    updatedAt: STAMP,
    deletedAt: null,
    ...overrides,
  };
}

export function byId<T extends { id: string }>(rows: T[]): Record<string, T> {
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}
