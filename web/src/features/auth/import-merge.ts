export type ImportSettings = {
  focusMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  longBreakEvery: number;
  autoStartFocus: boolean;
  autoStartShortBreak: boolean;
  autoStartLongBreak: boolean;
  themeId: "warm" | "night" | "forest";
};

/**
 * First login copies guest settings only when the account has none.
 * Sessions are added by id. A second import, or a known id, inserts nothing.
 */
export function decideImport<T extends { id: string }>(
  server: { hasSettings: boolean; sessionIds: ReadonlySet<string> },
  incoming: { settings: ImportSettings; sessions: readonly T[] },
): { settings: ImportSettings | null; sessions: T[] } {
  const seen = new Set<string>();
  const sessions = incoming.sessions.filter((session) => {
    if (server.sessionIds.has(session.id) || seen.has(session.id)) return false;
    seen.add(session.id);
    return true;
  });
  return {
    settings: server.hasSettings ? null : incoming.settings,
    sessions,
  };
}

/** A task a guest made on this device. Guests have no Pro fields, so there are none here. */
export type ImportTask = {
  id: string;
  title: string;
  done: boolean;
  doneAt: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * Which guest tasks to add to the account.
 * - An id the account already has is skipped (a retry inserts nothing), and so is an id that
 *   belongs to someone else.
 * - Done tasks always come along; they do not count toward the limit.
 * - A free account gets active tasks only while it has room under the limit. This is the same
 *   10-active rule the tasks API enforces; the import is not a way around it. Tasks that do not
 *   fit are reported in `skipped`.
 * - Imported tasks go after the tasks the account already has, in the guest's own order.
 */
export function decideTaskImport(
  server: {
    knownIds: ReadonlySet<string>;
    foreignIds: ReadonlySet<string>;
    activeCount: number;
    maxOrder: number;
    pro: boolean;
  },
  incoming: readonly ImportTask[],
  limit: number,
): { insert: ImportTask[]; skipped: number } {
  const seen = new Set<string>();
  const fresh = incoming
    .filter((task) => {
      if (server.knownIds.has(task.id) || server.foreignIds.has(task.id) || seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    })
    .sort((a, b) => a.order - b.order || Date.parse(a.createdAt) - Date.parse(b.createdAt));

  let room = server.pro ? Number.POSITIVE_INFINITY : Math.max(0, limit - server.activeCount);
  const insert: ImportTask[] = [];
  let skipped = 0;
  for (const task of fresh) {
    if (!task.done) {
      if (room <= 0) {
        skipped += 1;
        continue;
      }
      room -= 1;
    }
    insert.push({ ...task, order: server.maxOrder + 1 + insert.length });
  }
  return { insert, skipped };
}
