import type { TaskWire } from "./contract";
import { isActiveTask } from "./gate";
import { compareTasks } from "./order";

// Read-only views over the task map. Pure, so components stay small and the tests are easy.

type TaskMap = Readonly<Record<string, TaskWire>>;

function live(tasks: TaskMap): TaskWire[] {
  return Object.values(tasks).filter((task) => task.deletedAt == null);
}

/** Top-level tasks that are not done, in list order. These are the ones the free limit counts. */
export function activeTasks(tasks: TaskMap): TaskWire[] {
  return live(tasks).filter(isActiveTask).sort(compareTasks);
}

/** Finished top-level tasks, most recently finished first. */
export function doneTasks(tasks: TaskMap): TaskWire[] {
  return live(tasks)
    .filter((task) => task.done && task.parentId == null)
    .sort((a, b) => Date.parse(b.doneAt ?? b.updatedAt) - Date.parse(a.doneAt ?? a.updatedAt));
}

export function subtasksOf(tasks: TaskMap, parentId: string): TaskWire[] {
  return live(tasks)
    .filter((task) => task.parentId === parentId)
    .sort(compareTasks);
}

/** The task a focus session can be credited to: it exists, is not done and is not deleted. */
export function pickableTask(tasks: TaskMap, id: string | null): TaskWire | null {
  if (!id) return null;
  const task = tasks[id];
  if (!task || task.done || task.deletedAt != null) return null;
  return task;
}
