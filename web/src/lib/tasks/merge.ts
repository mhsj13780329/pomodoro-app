// Last-write-wins for tasks, projects and tags (PLAN.md §5.7). Pure, so the server
// and the browser use the same rule and the tests can check it without a database.

export type Stamped = { id: string; updatedAt: string; deletedAt: string | null };

/**
 * What the server does with one incoming write.
 * insert   - the id is new.
 * update   - the incoming edit is newer than the stored one.
 * stale    - the stored row is newer or equal (an equal stamp is a retry), or it was deleted.
 *
 * Delete is sticky: once a row is deleted, later edits from a slow device cannot bring it back.
 */
export type LwwDecision = "insert" | "update" | "stale";

export function decideLww(stored: Stamped | null, incoming: Stamped): LwwDecision {
  if (!stored) return "insert";
  if (stored.deletedAt != null) return "stale";
  return Date.parse(incoming.updatedAt) > Date.parse(stored.updatedAt) ? "update" : "stale";
}

/**
 * Folds rows from the server into the local copy.
 * - A row with a write still waiting in the queue keeps the local version; the flush settles it.
 * - A deleted row is removed locally (the device no longer needs the tombstone).
 * - `full` means the server sent the whole set, so local rows it did not list are gone,
 *   unless they are still waiting to upload.
 */
export function adoptRows<T extends Stamped>(
  local: Readonly<Record<string, T>>,
  incoming: readonly T[],
  pendingIds: ReadonlySet<string>,
  full: boolean,
): Record<string, T> {
  const next: Record<string, T> = { ...local };
  if (full) {
    const listed = new Set(incoming.map((row) => row.id));
    for (const id of Object.keys(next)) {
      if (!listed.has(id) && !pendingIds.has(id)) delete next[id];
    }
  }
  for (const row of incoming) {
    if (pendingIds.has(row.id)) continue;
    if (row.deletedAt != null) delete next[row.id];
    else next[row.id] = row;
  }
  return next;
}
