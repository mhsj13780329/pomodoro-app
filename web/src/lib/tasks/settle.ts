import type { ProjectWire, TagWire, TaskBatch, TaskBatchResult, TaskWire } from "./contract";

// What a device does with the server's answer to a flush. Pure, so the store stays thin
// and the tests can cover the cases (newer local edit, rejected, deleted) without a browser.

export type LocalRows = {
  tasks: Record<string, TaskWire>;
  projects: Record<string, ProjectWire>;
  tags: Record<string, TagWire>;
};

/** row id -> updatedAt of the newest local write that has not been confirmed yet. */
export type PendingStamps = Record<string, string>;

export type Settled = {
  rows: LocalRows;
  pending: PendingStamps;
  /** Set when the server refused something for a reason the user should see. */
  refused: "active_limit" | "pro_required" | null;
};

type Kind = "task" | "project" | "tag";
type AnyRow = TaskWire | ProjectWire | TagWire;

const bucket = { task: "tasks", project: "projects", tag: "tags" } as const;

function sentRow(sent: TaskBatch, kind: Kind, id: string): AnyRow | undefined {
  const list: readonly AnyRow[] = sent[bucket[kind]];
  return list.find((row) => row.id === id);
}

function serverRow(result: TaskBatchResult, kind: Kind, id: string): AnyRow | undefined {
  const list: readonly AnyRow[] = result.rows[bucket[kind]];
  return list.find((row) => row.id === id);
}

/**
 * Folds the server's per-item answers into the local copy.
 * - A confirmed write stops being pending.
 * - If the server kept (or sent back) a different version, adopt it, unless this device has
 *   edited the row again since: that newer edit is still queued and will be judged next.
 * - A refused write that the server never stored is removed locally. Nothing is shown as an
 *   error toast; `refused` lets the screen show a calm inline note.
 */
export function settleBatch(
  local: LocalRows,
  pending: PendingStamps,
  sent: TaskBatch,
  result: TaskBatchResult,
): Settled {
  const rows: LocalRows = { tasks: { ...local.tasks }, projects: { ...local.projects }, tags: { ...local.tags } };
  const stillPending: PendingStamps = { ...pending };
  let refused: Settled["refused"] = null;

  for (const item of result.results) {
    const sentVersion = sentRow(sent, item.kind, item.id);
    if (!sentVersion) continue;
    // A newer local edit exists. Leave everything about this row to the next flush.
    if (stillPending[item.id] !== sentVersion.updatedAt) continue;
    delete stillPending[item.id];

    if (item.status === "applied") continue;

    if (item.status === "rejected" && (item.reason === "active_limit" || item.reason === "pro_required")) {
      refused ??= item.reason;
    }
    const target = rows[bucket[item.kind]] as Record<string, AnyRow>;
    const server = serverRow(result, item.kind, item.id);
    if (!server || server.deletedAt != null) delete target[item.id];
    else target[item.id] = server;
  }

  return { rows, pending: stillPending, refused };
}
