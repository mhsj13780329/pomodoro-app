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
