// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { byId, makeProject, makeTask } from "@/test/factories";

// The store queues writes for upload through the sync engine. Tests run signed out unless they set `sync.online`.
const sync = vi.hoisted(() => ({ online: false, publishTaskWrites: vi.fn() }));
vi.mock("@/lib/sync/engine", () => ({
  publishTaskWrites: sync.publishTaskWrites,
  publishTimerCommand: vi.fn(),
  settingsChanged: vi.fn(),
  syncIsActive: () => sync.online,
  syncNow: () => Date.now(),
}));

const { PROJECT_NAME_MAX, useTasksStore } = await import("./store");

const store = () => useTasksStore.getState();
const live = () => Object.values(store().tasks).filter((task) => task.deletedAt == null);

function seed({ pro = true, tasks = [] as ReturnType<typeof makeTask>[], projects = [] as ReturnType<typeof makeProject>[] } = {}) {
  useTasksStore.setState({ pro, tasks: byId(tasks), projects: byId(projects), notice: null });
}

beforeEach(() => {
  sync.online = false;
  sync.publishTaskWrites.mockClear();
  localStorage.clear();
  seed();
});

describe("addTask with a project", () => {
  it("files the new task into the given project", () => {
    seed({ projects: [makeProject({ id: "thesis" })] });
    expect(store().addTask("Write chapter 2", "thesis")).toBe("ok");
    expect(live()).toHaveLength(1);
    expect(live()[0]).toMatchObject({ title: "Write chapter 2", projectId: "thesis", parentId: null });
  });

  it("adds without a project when none is given", () => {
    expect(store().addTask("Plain task")).toBe("ok");
    expect(live()[0]!.projectId).toBeNull();
  });

  it("ignores a project id that does not exist", () => {
    expect(store().addTask("Orphan", "missing")).toBe("ok");
    expect(live()[0]!.projectId).toBeNull();
  });

  it("refuses a project for a free account and keeps nothing", () => {
    seed({ pro: false, projects: [makeProject({ id: "thesis" })] });
    expect(store().addTask("Write", "thesis")).toBe("pro_required");
    expect(live()).toHaveLength(0);
    expect(store().notice).toBe("pro_required");
  });

  it("still lets a free account add a task without a project", () => {
    seed({ pro: false });
    expect(store().addTask("Write")).toBe("ok");
  });
});

describe("addProject", () => {
  it("creates the project and returns its id", () => {
    const { result, id } = store().addProject("  Thesis  ", "long");
    expect(result).toBe("ok");
    expect(id).toBeTruthy();
    expect(store().projects[id!]).toMatchObject({ name: "Thesis", color: "long", archived: false, deletedAt: null });
  });

  it("trims a long name to the limit", () => {
    const { id } = store().addProject("x".repeat(PROJECT_NAME_MAX + 20), "focus");
    expect(store().projects[id!]!.name).toHaveLength(PROJECT_NAME_MAX);
  });

  it("refuses an empty name", () => {
    expect(store().addProject("   ", "focus")).toEqual({ result: "empty", id: null });
    expect(Object.keys(store().projects)).toHaveLength(0);
  });

  it("refuses a free account", () => {
    seed({ pro: false });
    expect(store().addProject("Thesis", "focus")).toEqual({ result: "pro_required", id: null });
    expect(Object.keys(store().projects)).toHaveLength(0);
  });
});

describe("updateProject", () => {
  it("renames, recolors and archives", () => {
    seed({ projects: [makeProject({ id: "p" })] });
    expect(store().updateProject("p", { name: " Renamed ", color: "amber", archived: true })).toBe("ok");
    expect(store().projects.p).toMatchObject({ name: "Renamed", color: "amber", archived: true });
  });

  it("refuses an empty name and leaves the project unchanged", () => {
    seed({ projects: [makeProject({ id: "p", name: "Keep" })] });
    expect(store().updateProject("p", { name: " " })).toBe("empty");
    expect(store().projects.p!.name).toBe("Keep");
  });

  it("refuses a free account", () => {
    seed({ pro: false, projects: [makeProject({ id: "p" })] });
    expect(store().updateProject("p", { archived: true })).toBe("pro_required");
    expect(store().projects.p!.archived).toBe(false);
  });
});

describe("removeProject", () => {
  const setup = () =>
    seed({
      projects: [makeProject({ id: "p" }), makeProject({ id: "other" })],
      tasks: [
        makeTask({ id: "active", projectId: "p" }),
        makeTask({ id: "finished", projectId: "p", done: true }),
        makeTask({ id: "child", parentId: "active" }),
        makeTask({ id: "elsewhere", projectId: "other" }),
        makeTask({ id: "loose" }),
      ],
    });

  it("by default keeps the tasks and moves them to 'no project'", () => {
    setup();
    expect(store().removeProject("p")).toBe("ok");
    // A deleted row leaves the local store at once.
    expect(store().projects.p).toBeUndefined();
    expect(store().tasks.active).toMatchObject({ projectId: null, deletedAt: null });
    expect(store().tasks.finished).toMatchObject({ projectId: null, deletedAt: null });
    expect(store().tasks.child!.deletedAt).toBeNull();
    expect(store().tasks.elsewhere!.projectId).toBe("other");
  });

  it("with deleteTasks deletes the project's tasks and their subtasks, and nothing else", () => {
    setup();
    expect(store().removeProject("p", { deleteTasks: true })).toBe("ok");
    for (const id of ["active", "finished", "child"]) expect(store().tasks[id]).toBeUndefined();
    expect(store().tasks.elsewhere!.deletedAt).toBeNull();
    expect(store().tasks.loose!.deletedAt).toBeNull();
  });

  it("bumps updatedAt on every row it changes, so the change wins on sync", () => {
    setup();
    const before = store().tasks.active!.updatedAt;
    store().removeProject("p");
    expect(Date.parse(store().tasks.active!.updatedAt)).toBeGreaterThan(Date.parse(before));
  });

  it("signed in, uploads the project and every affected task as soft deletes", () => {
    setup();
    sync.online = true;
    store().removeProject("p", { deleteTasks: true });
    const sent = sync.publishTaskWrites.mock.calls.at(-1)![0] as {
      projects: { id: string; deletedAt: string | null }[];
      tasks: { id: string; deletedAt: string | null }[];
    };
    expect(sent.projects).toEqual([expect.objectContaining({ id: "p", deletedAt: expect.any(String) })]);
    expect(sent.tasks.map((task) => task.id).sort()).toEqual(["active", "child", "finished"]);
    expect(sent.tasks.every((task) => task.deletedAt != null)).toBe(true);
  });

  it("signed in, keeping tasks uploads them with the project cleared", () => {
    setup();
    sync.online = true;
    store().removeProject("p");
    const sent = sync.publishTaskWrites.mock.calls.at(-1)![0] as { tasks: { id: string; projectId: string | null }[] };
    expect(sent.tasks.map((task) => [task.id, task.projectId]).sort()).toEqual([
      ["active", null],
      ["finished", null],
    ]);
  });

  it("does nothing for a missing project", () => {
    setup();
    expect(store().removeProject("nope")).toBe("missing");
  });

  it("refuses a free account and leaves the tasks alone", () => {
    setup();
    useTasksStore.setState({ pro: false });
    expect(store().removeProject("p", { deleteTasks: true })).toBe("pro_required");
    expect(store().projects.p!.deletedAt).toBeNull();
    expect(store().tasks.active!.deletedAt).toBeNull();
  });
});

describe("updateTask projectId", () => {
  it("moves a task into a project and back out", () => {
    seed({ projects: [makeProject({ id: "p" })], tasks: [makeTask({ id: "t" })] });
    expect(store().updateTask("t", { projectId: "p" })).toBe("ok");
    expect(store().tasks.t!.projectId).toBe("p");
    expect(store().updateTask("t", { projectId: null })).toBe("ok");
    expect(store().tasks.t!.projectId).toBeNull();
  });

  it("lets a free account clear a project but not set one", () => {
    seed({ pro: false, projects: [makeProject({ id: "p" })], tasks: [makeTask({ id: "t", projectId: "p" })] });
    expect(store().updateTask("t", { projectId: null })).toBe("ok");
    expect(store().updateTask("t", { projectId: "p" })).toBe("pro_required");
  });
});
