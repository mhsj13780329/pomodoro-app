import { FREE_ACTIVE_LIMIT, type TaskWire } from "./contract";

// The rules for who may write what. Pure, so the server and the tests share one copy.
// The server calls these inside a transaction; the UI only mirrors them for display.

export type GateTask = Pick<
  TaskWire,
  "done" | "deletedAt" | "parentId" | "projectId" | "estimatePomodoros" | "notes" | "tagIds"
>;

export type GateResult = { ok: true } | { ok: false; reason: "active_limit" | "pro_required" };

/** "Active" = a top-level task that is neither done nor deleted. Only these count toward the free limit. */
export function isActiveTask(task: Pick<GateTask, "done" | "deletedAt" | "parentId">): boolean {
  return !task.done && task.deletedAt == null && task.parentId == null;
}

/** Notes: empty text and null mean the same thing. */
function noteOf(notes: string | null): string | null {
  return notes == null || notes === "" ? null : notes;
}

/**
 * True when the write adds or changes a Pro-only field.
 * Clearing a field (back to none) is allowed: it creates nothing, and it lets a user whose
 * Pro ended tidy up. Keeping the stored value is allowed too, so renaming, checking off,
 * reordering or deleting a task that already has a project still works after Pro ends.
 */
function changesProFields(stored: GateTask | null, incoming: GateTask): boolean {
  const before = stored ?? { projectId: null, parentId: null, estimatePomodoros: null, notes: null, tagIds: [] };

  if (incoming.projectId != null && incoming.projectId !== before.projectId) return true;
  if (incoming.parentId != null && incoming.parentId !== before.parentId) return true;
  if (incoming.estimatePomodoros != null && incoming.estimatePomodoros !== before.estimatePomodoros) return true;
  const note = noteOf(incoming.notes);
  if (note != null && note !== noteOf(before.notes)) return true;
  const known = new Set(before.tagIds);
  if (incoming.tagIds.some((id) => !known.has(id))) return true;
  return false;
}

/**
 * Decides one task write.
 *
 * `activeCount` is how many active tasks the user has, NOT counting this task.
 * Free users are stopped when a write would make a task active (new, or un-checked)
 * and they already have the limit or more. A user who is over the limit (for example
 * after importing guest tasks) can still rename, finish, reorder and delete.
 */
export function gateTaskWrite(
  stored: GateTask | null,
  incoming: GateTask,
  ctx: { pro: boolean; activeCount: number; limit?: number },
): GateResult {
  if (ctx.pro) return { ok: true };

  if (changesProFields(stored, incoming)) return { ok: false, reason: "pro_required" };

  const becomesActive = isActiveTask(incoming) && (stored == null || !isActiveTask(stored));
  if (becomesActive && ctx.activeCount >= (ctx.limit ?? FREE_ACTIVE_LIMIT)) {
    return { ok: false, reason: "active_limit" };
  }
  return { ok: true };
}

/** Projects and tags are Pro-only to create, rename, archive or delete. Reading them is never gated. */
export function gateProItemWrite(ctx: { pro: boolean }): GateResult {
  return ctx.pro ? { ok: true } : { ok: false, reason: "pro_required" };
}
