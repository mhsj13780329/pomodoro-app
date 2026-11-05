import type { NoteWire } from "./contract";

// The rules for who may write a note. Pure, so the server and the tests share one copy.

export type GateNote = Pick<NoteWire, "title" | "body" | "updatedAt" | "deletedAt">;

/**
 * insert       - new note (Pro).
 * update       - newer title/body for a live note (Pro).
 * delete       - sets deletedAt; allowed for everyone.
 * stale        - the stored row is newer or equal, or it is already deleted: ignore the write.
 * pro_required - would create or change content on a non-Pro account.
 */
export type NoteDecision = "insert" | "update" | "delete" | "stale" | "pro_required";

export function decideNoteWrite(stored: GateNote | null, incoming: GateNote, ctx: { pro: boolean }): NoteDecision {
  if (stored) {
    // Delete is sticky, and an equal stamp is a retry.
    if (stored.deletedAt != null) return "stale";
    if (Date.parse(incoming.updatedAt) <= Date.parse(stored.updatedAt)) return "stale";
  }
  if (incoming.deletedAt != null) return "delete";
  if (!ctx.pro) return "pro_required";
  return stored ? "update" : "insert";
}
