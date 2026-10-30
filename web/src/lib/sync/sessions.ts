import type { SessionInput } from "./contract";

/** A start time this far ahead of the server is still accepted. Covers clock skew. */
const FUTURE_SKEW_MS = 60_000;

export type SessionBatch = {
  accepted: string[];
  existing: string[];
  rejected: string[];
  insert: SessionInput[];
};

/**
 * Splits a flush into rows to insert, rows already stored, and rows to drop.
 * `knownIds` belong to this user. `foreignIds` belong to someone else and must
 * not be overwritten. A repeated id in the same batch counts as already stored.
 */
export function classifySessionBatch(
  sessions: readonly SessionInput[],
  knownIds: ReadonlySet<string>,
  foreignIds: ReadonlySet<string>,
  serverNow: number,
): SessionBatch {
  const accepted: string[] = [];
  const existing: string[] = [];
  const rejected: string[] = [];
  const insert: SessionInput[] = [];
  const seen = new Set<string>();

  for (const session of sessions) {
    if (foreignIds.has(session.id)) {
      rejected.push(session.id);
      continue;
    }
    if (knownIds.has(session.id) || seen.has(session.id)) {
      existing.push(session.id);
      continue;
    }
    if (!acceptable(session, serverNow)) {
      rejected.push(session.id);
      continue;
    }
    seen.add(session.id);
    accepted.push(session.id);
    insert.push(session);
  }

  return { accepted, existing, rejected, insert };
}

function acceptable(session: SessionInput, serverNow: number): boolean {
  const startedAt = Date.parse(session.startedAt);
  const endedAt = Date.parse(session.endedAt);
  if (Number.isNaN(startedAt) || Number.isNaN(endedAt) || endedAt <= startedAt) return false;
  if (startedAt > serverNow + FUTURE_SKEW_MS) return false;
  if (session.durationSec > session.plannedSec + 60) return false;
  return true;
}
