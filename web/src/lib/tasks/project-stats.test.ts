import { describe, expect, it } from "vitest";
import { byId, makeProject, makeTask } from "@/test/factories";
import { NO_PROJECT, projectStatsOf } from "./project-stats";

describe("projectStatsOf", () => {
  const projects = byId([makeProject({ id: "thesis" }), makeProject({ id: "math" })]);

  it("gives every project and 'no project' an entry, even with no tasks", () => {
    expect(projectStatsOf([], {}, projects)).toEqual({
      [NO_PROJECT]: { active: 0, done: 0, sessions: 0 },
      thesis: { active: 0, done: 0, sessions: 0 },
      math: { active: 0, done: 0, sessions: 0 },
    });
  });

  it("counts active and done tasks and sums their focus sessions per project", () => {
    const tasks = [
      makeTask({ id: "a", projectId: "thesis" }),
      makeTask({ id: "b", projectId: "thesis", done: true }),
      makeTask({ id: "c", projectId: "math" }),
      makeTask({ id: "d" }),
    ];
    const stats = projectStatsOf(tasks, { a: 3, b: 2, c: 1 }, projects);
    expect(stats.thesis).toEqual({ active: 1, done: 1, sessions: 5 });
    expect(stats.math).toEqual({ active: 1, done: 0, sessions: 1 });
    expect(stats[NO_PROJECT]).toEqual({ active: 1, done: 0, sessions: 0 });
  });

  it("counts a task whose project no longer exists under 'no project'", () => {
    const stats = projectStatsOf([makeTask({ id: "a", projectId: "gone" })], { a: 4 }, projects);
    expect(stats[NO_PROJECT]).toEqual({ active: 1, done: 0, sessions: 4 });
    expect(stats.gone).toBeUndefined();
  });

  it("includes archived projects", () => {
    const withArchived = byId([makeProject({ id: "old", archived: true })]);
    const stats = projectStatsOf([makeTask({ id: "a", projectId: "old", done: true })], {}, withArchived);
    expect(stats.old).toEqual({ active: 0, done: 1, sessions: 0 });
  });
});
