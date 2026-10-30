// Ordering for the task list. Pure, shared by the store and the tests.

export type Orderable = { id: string; order: number; createdAt: string };

/** order, then createdAt, then id. Two devices can pick the same order number; this keeps them stable. */
export function compareTasks(a: Orderable, b: Orderable): number {
  if (a.order !== b.order) return a.order - b.order;
  const created = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (created !== 0) return created;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortTasks<T extends Orderable>(tasks: readonly T[]): T[] {
  return [...tasks].sort(compareTasks);
}

/** A new task goes to the end of the list. */
export function nextOrder(tasks: readonly Pick<Orderable, "order">[]): number {
  return tasks.reduce((max, task) => Math.max(max, task.order), -1) + 1;
}

export type OrderChange = { id: string; order: number };

/**
 * Moves one task up or down among its siblings (a non-drag way to reorder).
 * Returns only the rows whose order number changes. Siblings are renumbered 0..n-1 first,
 * so two tasks that shared an order number still end up in a clear sequence.
 * An empty result means the task is already at that end.
 */
export function moveTask(siblings: readonly Orderable[], id: string, direction: "up" | "down"): OrderChange[] {
  const sorted = sortTasks(siblings);
  const from = sorted.findIndex((task) => task.id === id);
  if (from === -1) return [];
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= sorted.length) return [];

  const next = [...sorted];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);

  const changes: OrderChange[] = [];
  next.forEach((task, index) => {
    if (task.order !== index) changes.push({ id: task.id, order: index });
  });
  return changes;
}
