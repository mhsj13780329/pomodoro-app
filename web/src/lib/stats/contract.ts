// The shape of GET /api/stats. Safe to import from client components: no database code.

export type StatsSession = {
  id: string;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  taskId: string | null;
  projectId: string | null;
};

export type StatsBreakdownRow = {
  /** Null is the "no task" or "no project" bucket. */
  id: string | null;
  name: string | null;
  deleted: boolean;
  focusSec: number;
  sessions: number;
};

export type StatsResponse = {
  timezone: string;
  pro: boolean;
  /** Gregorian civil date in `timezone`. */
  today: string;
  from: string;
  to: string;
  sessions: StatsSession[];
  currentStreak: number;
  bestStreak: number;
  /**
   * Days of the current streak that are older than `from`.
   * No minutes, so this is not a history heatmap. The client needs them so a
   * session still waiting to upload can extend a streak that started before the window.
   */
  streakDatesBeforeRange: string[];
  tasks?: StatsBreakdownRow[];
  projects?: StatsBreakdownRow[];
};
