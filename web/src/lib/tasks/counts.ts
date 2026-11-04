// "done/planned" on a task row is DERIVED: the number of completed focus sessions
// that point at the task. Nothing is stored on the task itself, so it cannot drift.

export type CountableSession = {
  id: string;
  phase?: string;
  completed?: boolean;
  taskId?: string | null;
};

/** Completed focus sessions per task id. A repeated session id counts once. */
export function countCompletedFocus(sessions: readonly CountableSession[]): Record<string, number> {
  const seen = new Set<string>();
  const counts: Record<string, number> = {};
  for (const session of sessions) {
    if (!session.taskId) continue;
    if (session.phase !== undefined && session.phase !== "focus") continue;
    if (session.completed === false) continue;
    if (seen.has(session.id)) continue;
    seen.add(session.id);
    counts[session.taskId] = (counts[session.taskId] ?? 0) + 1;
  }
  return counts;
}

/**
 * What a signed-in device knows about the server's pomodoro counts.
 *
 * `counts` are the server's numbers. `countedIds` are the session ids those numbers already
 * include (the server lists the recent ones). A finished focus reaches the server twice: once
 * with the timer's `complete`, once from the upload queue. Without ids the device cannot tell
 * whether a queued session is already inside a server number, and counts it twice.
 */
export type ServerCounts = {
  counts: Readonly<Record<string, number>>;
  countedIds: readonly string[];
};

export const NO_COUNTS: ServerCounts = { counts: {}, countedIds: [] };

/** A pull replaces everything: the server's numbers and ids are the truth. */
export function adoptServerCounts(block: { counts: Record<string, number>; countedIds: string[] }): ServerCounts {
  return { counts: { ...block.counts }, countedIds: [...block.countedIds] };
}

/**
 * Sessions the server just confirmed it stores (accepted or already there). Each one is counted
 * now unless the last pull already included it; the next pull replaces this with the server's numbers.
 */
export function noteUploaded(current: ServerCounts, uploaded: readonly CountableSession[]): ServerCounts {
  const known = new Set(current.countedIds);
  const fresh = uploaded.filter((session) => !known.has(session.id));
  const counts: Record<string, number> = { ...current.counts };
  for (const [taskId, extra] of Object.entries(countCompletedFocus(fresh))) {
    counts[taskId] = (counts[taskId] ?? 0) + extra;
  }
  return { counts, countedIds: [...current.countedIds, ...fresh.map((session) => session.id)] };
}

/**
 * What a signed-in device shows: the server's counts plus sessions this device finished
 * but has not uploaded yet, so the number moves the moment a focus ends, even offline.
 * A waiting session the server already counted is not added again.
 */
export function pomodoroCounts(
  server: ServerCounts,
  pending: readonly CountableSession[],
): Record<string, number> {
  const known = new Set(server.countedIds);
  const merged: Record<string, number> = { ...server.counts };
  const waiting = pending.filter((session) => !known.has(session.id));
  for (const [taskId, extra] of Object.entries(countCompletedFocus(waiting))) {
    merged[taskId] = (merged[taskId] ?? 0) + extra;
  }
  return merged;
}
