import type { NoteBatch, NoteBatchResult, NoteWire } from "./contract";

// Pure client-side folding of server answers into the local copy, so it can be tested without a browser.

export type NotesLocal = {
  notes: Record<string, NoteWire>;
  queue: Record<string, NoteWire>;
};

/**
 * Applies the answer to one flush. A queued row that changed while the request was in flight
 * (newer updatedAt than what was sent) stays queued and keeps the local version.
 */
export function settleNotes(local: NotesLocal, sent: NoteBatch, result: NoteBatchResult): NotesLocal {
  const notes = { ...local.notes };
  const queue = { ...local.queue };
  const server = new Map(result.rows.map((row) => [row.id, row]));
  const outcome = new Map(result.results.map((item) => [item.id, item.status]));

  for (const row of sent.notes) {
    const queued = queue[row.id];
    if (!queued || queued.updatedAt !== row.updatedAt) continue;
    delete queue[row.id];
    if (outcome.get(row.id) === "ok") continue;
    const theirs = server.get(row.id);
    if (!theirs || theirs.deletedAt != null) delete notes[row.id];
    else notes[row.id] = theirs;
  }
  return { notes, queue };
}

/** Folds a pull in. Rows still waiting to upload keep the local version; deleted rows disappear. */
export function adoptNotes(
  local: NotesLocal,
  incoming: readonly NoteWire[],
  full: boolean,
): Record<string, NoteWire> {
  const notes = { ...local.notes };
  if (full) {
    const listed = new Set(incoming.map((row) => row.id));
    for (const id of Object.keys(notes)) if (!listed.has(id) && !local.queue[id]) delete notes[id];
  }
  for (const row of incoming) {
    if (local.queue[row.id]) continue;
    if (row.deletedAt != null) delete notes[row.id];
    else notes[row.id] = row;
  }
  return notes;
}
