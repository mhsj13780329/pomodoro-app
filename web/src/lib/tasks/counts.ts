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
 * What a signed-in device shows: the server's counts plus sessions this device finished
 * but has not uploaded yet, so the number moves the moment a focus ends, even offline.
 */
export function pomodoroCounts(
  serverCounts: Readonly<Record<string, number>>,
  pending: readonly CountableSession[],
): Record<string, number> {
  const merged: Record<string, number> = { ...serverCounts };
  for (const [taskId, extra] of Object.entries(countCompletedFocus(pending))) {
    merged[taskId] = (merged[taskId] ?? 0) + extra;
  }
  return merged;
}
