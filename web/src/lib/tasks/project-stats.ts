import type { ProjectWire, TaskWire } from "./contract";

/** The key used for tasks without a project (or whose project was deleted). */
export const NO_PROJECT = "none";

export type ProjectStats = { active: number; done: number; sessions: number };

/**
 * Per project: active and finished top-level tasks, and completed focus sessions on all of them.
 * Every live project gets an entry, even an empty one. A task whose project no longer exists
 * counts under NO_PROJECT.
 */
export function projectStatsOf(
  tasks: readonly TaskWire[],
  counts: Readonly<Record<string, number>>,
  projects: Readonly<Record<string, ProjectWire>>,
): Record<string, ProjectStats> {
  const stats: Record<string, ProjectStats> = { [NO_PROJECT]: { active: 0, done: 0, sessions: 0 } };
  for (const project of Object.values(projects)) stats[project.id] = { active: 0, done: 0, sessions: 0 };
  for (const task of tasks) {
    const entry = stats[task.projectId && projects[task.projectId] ? task.projectId : NO_PROJECT]!;
    if (task.done) entry.done += 1;
    else entry.active += 1;
    entry.sessions += counts[task.id] ?? 0;
  }
  return stats;
}
