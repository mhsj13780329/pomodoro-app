// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { byId, makeProject, makeTask } from "@/test/factories";
import { renderWithIntl } from "@/test/render";
import { NO_PROJECT, type ProjectStats } from "@/lib/tasks/project-stats";

vi.mock("@/lib/sync/engine", () => ({
  publishTaskWrites: vi.fn(),
  publishTimerCommand: vi.fn(),
  settingsChanged: vi.fn(),
  syncIsActive: () => false,
  syncNow: () => Date.now(),
}));
// The real Link needs the Next.js router; a plain anchor is enough to check where it points.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { useTasksStore } = await import("../store");
const { ProjectBar } = await import("./project-bar");
const { ProjectEditor } = await import("./project-editor");
const { ProjectDelete } = await import("./project-delete");
const { ProjectHeader } = await import("./project-header");
const { ProjectPicker } = await import("./project-picker");
const { ProjectsDialog } = await import("./projects-dialog");
const { ProjectsUpsell } = await import("./projects-upsell");
const { TaskAddForm } = await import("./task-add-form");
const { TaskFilterBar } = await import("./task-filter-bar");

const store = () => useTasksStore.getState();
const liveTasks = () => Object.values(store().tasks);

const thesis = makeProject({ id: "thesis", name: "Thesis", color: "long", createdAt: "2026-01-01T00:00:00.000Z" });
const math = makeProject({ id: "math", name: "Math", color: "amber", createdAt: "2026-01-02T00:00:00.000Z" });
const old = makeProject({ id: "old", name: "Old exam", archived: true, createdAt: "2026-01-03T00:00:00.000Z" });

const stats = (entries: Record<string, Partial<ProjectStats>>): Record<string, ProjectStats> =>
  Object.fromEntries(
    Object.entries(entries).map(([id, value]) => [id, { active: 0, done: 0, sessions: 0, ...value }]),
  );

function seed({ pro = true, projects = [thesis, math], tasks = [] as ReturnType<typeof makeTask>[] } = {}) {
  useTasksStore.setState({ pro, projects: byId(projects), tasks: byId(tasks), notice: null });
}

beforeEach(() => {
  localStorage.clear();
  seed();
});

describe("ProjectBar", () => {
  const props = () => ({
    projects: [thesis, math],
    stats: stats({ [NO_PROJECT]: { active: 1 }, thesis: { active: 2 }, math: { active: 0 } }),
    total: 3,
    selected: "",
    onSelect: vi.fn(),
    pro: true,
    onManage: vi.fn(),
    onNew: vi.fn(),
    onLocked: vi.fn(),
  });

  it("shows All, No project and each project with its active count", () => {
    renderWithIntl(<ProjectBar {...props()} />);
    const nav = screen.getByRole("navigation", { name: "Filter by project" });
    expect(within(nav).getByRole("button", { name: "All 3" })).toHaveAttribute("aria-pressed", "true");
    expect(within(nav).getByRole("button", { name: "No project 1" })).toHaveAttribute("aria-pressed", "false");
    expect(within(nav).getByRole("button", { name: "Thesis 2" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Math 0" })).toBeInTheDocument();
  });

  it("selects a project, 'no project' or all", async () => {
    const p = props();
    renderWithIntl(<ProjectBar {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Thesis 2" }));
    await userEvent.click(screen.getByRole("button", { name: "No project 1" }));
    await userEvent.click(screen.getByRole("button", { name: "All 3" }));
    expect(p.onSelect.mock.calls).toEqual([["thesis"], [NO_PROJECT], [""]]);
  });

  it("marks the selected project as pressed", () => {
    renderWithIntl(<ProjectBar {...props()} selected="thesis" />);
    expect(screen.getByRole("button", { name: "Thesis 2" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All 3" })).toHaveAttribute("aria-pressed", "false");
  });

  it("opens the manager and the new-project dialog", async () => {
    const p = props();
    renderWithIntl(<ProjectBar {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Manage projects" }));
    await userEvent.click(screen.getByRole("button", { name: "New project" }));
    expect(p.onManage).toHaveBeenCalledOnce();
    expect(p.onNew).toHaveBeenCalledOnce();
  });

  it("labels an archived project that is in the bar", () => {
    renderWithIntl(<ProjectBar {...props()} projects={[old]} stats={stats({ old: {} })} selected="old" />);
    expect(screen.getByRole("button", { name: "Old exam (archived) 0" })).toBeInTheDocument();
  });

  it("gives a free account with no projects a locked button instead", async () => {
    const p = { ...props(), pro: false, projects: [] };
    renderWithIntl(<ProjectBar {...p} />);
    expect(screen.queryByRole("button", { name: /No project/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New project" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Projects/ }));
    expect(p.onLocked).toHaveBeenCalledOnce();
  });

  it("still shows a former Pro user's projects, without the new button", () => {
    renderWithIntl(<ProjectBar {...props()} pro={false} />);
    expect(screen.getByRole("button", { name: "Thesis 2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New project" })).not.toBeInTheDocument();
  });
});

describe("ProjectEditor", () => {
  it("creates a project with the chosen color and reports its id", async () => {
    seed({ projects: [] });
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderWithIntl(<ProjectEditor open project={null} onClose={onClose} onSaved={onSaved} />);
    expect(screen.getByRole("heading", { name: "New project" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Project name"), "Thesis");
    await userEvent.click(screen.getByRole("radio", { name: "Color 3" }));
    await userEvent.click(screen.getByRole("button", { name: "Create project" }));

    const [created] = Object.values(store().projects);
    expect(created).toMatchObject({ name: "Thesis", color: "long" });
    expect(onSaved).toHaveBeenCalledWith(created!.id);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps Create disabled until there is a name", async () => {
    renderWithIntl(<ProjectEditor open project={null} onClose={vi.fn()} />);
    const create = screen.getByRole("button", { name: "Create project" });
    expect(create).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Project name"), "   ");
    expect(create).toBeDisabled();
  });

  it("refuses a name another project already has, ignoring case", async () => {
    renderWithIntl(<ProjectEditor open project={null} onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Project name"), "thesis");
    expect(screen.getByText("You already have a project with this name.")).toBeInTheDocument();
    expect(screen.getByLabelText("Project name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
  });

  it("previews the name as it is typed", async () => {
    renderWithIntl(<ProjectEditor open project={null} onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Project name"), "Chores");
    expect(screen.getAllByText("Chores")).toHaveLength(2);
  });

  it("prefills a name passed in", () => {
    renderWithIntl(<ProjectEditor open project={null} initialName="Garden" onClose={vi.fn()} />);
    expect(screen.getByLabelText("Project name")).toHaveValue("Garden");
  });

  it("edits an existing project, keeping its own name allowed", async () => {
    const onSaved = vi.fn();
    renderWithIntl(<ProjectEditor open project={thesis} onClose={vi.fn()} onSaved={onSaved} />);
    expect(screen.getByRole("heading", { name: "Edit “Thesis”" })).toBeInTheDocument();
    expect(screen.getByLabelText("Project name")).toHaveValue("Thesis");
    expect(screen.getByRole("radio", { name: "Color 3" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    await userEvent.clear(screen.getByLabelText("Project name"));
    await userEvent.type(screen.getByLabelText("Project name"), "Thesis draft");
    await userEvent.click(screen.getByRole("radio", { name: "Color 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(store().projects.thesis).toMatchObject({ name: "Thesis draft", color: "focus" });
    expect(onSaved).toHaveBeenCalledWith("thesis");
  });

  it("cancels without saving", async () => {
    const onClose = vi.fn();
    renderWithIntl(<ProjectEditor open project={null} onClose={onClose} />);
    await userEvent.type(screen.getByLabelText("Project name"), "Nope");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(Object.values(store().projects).some((p) => p.name === "Nope")).toBe(false);
  });

  it("stays open when the store refuses (free account)", async () => {
    seed({ pro: false, projects: [] });
    const onClose = vi.fn();
    renderWithIntl(<ProjectEditor open project={null} onClose={onClose} />);
    await userEvent.type(screen.getByLabelText("Project name"), "Thesis");
    await userEvent.click(screen.getByRole("button", { name: "Create project" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(store().notice).toBe("pro_required");
  });
});

describe("ProjectDelete", () => {
  const tasks = [
    makeTask({ id: "a", projectId: "thesis" }),
    makeTask({ id: "b", projectId: "thesis", done: true }),
  ];

  it("asks what to do with the tasks and keeps them by default", async () => {
    seed({ tasks });
    const onDeleted = vi.fn();
    renderWithIntl(
      <ProjectDelete project={thesis} stats={stats({ thesis: { active: 1, done: 1 } }).thesis} onClose={vi.fn()} onDeleted={onDeleted} />,
    );
    expect(screen.getByRole("heading", { name: "Delete “Thesis”?" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Keep the tasks/ })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Delete project" }));

    expect(store().projects.thesis).toBeUndefined();
    expect(store().tasks.a!.projectId).toBeNull();
    expect(store().tasks.b!.projectId).toBeNull();
    expect(onDeleted).toHaveBeenCalledOnce();
  });

  it("deletes the tasks too when asked, and says how many", async () => {
    seed({ tasks });
    renderWithIntl(<ProjectDelete project={thesis} stats={stats({ thesis: { active: 1, done: 1 } }).thesis} onClose={vi.fn()} />);
    expect(screen.getByText("2 tasks are deleted.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Delete the tasks too/ }));
    await userEvent.click(screen.getByRole("button", { name: "Delete project and tasks" }));
    expect(liveTasks()).toHaveLength(0);
  });

  it("skips the choice for an empty project", () => {
    renderWithIntl(<ProjectDelete project={thesis} stats={stats({ thesis: {} }).thesis} onClose={vi.fn()} />);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByText("Your focus stats stay as they are.")).toBeInTheDocument();
  });

  it("can archive instead of deleting", async () => {
    const onClose = vi.fn();
    renderWithIntl(<ProjectDelete project={thesis} stats={undefined} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /Archive it instead/ }));
    expect(store().projects.thesis).toMatchObject({ archived: true, deletedAt: null });
    expect(onClose).toHaveBeenCalled();
  });

  it("does not offer archiving for an archived project", () => {
    seed({ projects: [old] });
    renderWithIntl(<ProjectDelete project={old} stats={undefined} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Archive it instead/ })).not.toBeInTheDocument();
  });

  it("cancel leaves everything as it was", async () => {
    seed({ tasks });
    const onClose = vi.fn();
    renderWithIntl(<ProjectDelete project={thesis} stats={undefined} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(store().projects.thesis).toBeDefined();
  });

  it("renders nothing while closed", () => {
    renderWithIntl(<ProjectDelete project={null} stats={undefined} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Delete project" })).not.toBeInTheDocument();
  });
});

describe("ProjectHeader", () => {
  it("shows the project's numbers and its actions for Pro", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    renderWithIntl(
      <ProjectHeader project={thesis} stats={stats({ thesis: { active: 2, sessions: 5 } }).thesis} pro onEdit={onEdit} onDelete={onDelete} />,
    );
    expect(screen.getByText("2 active tasks · 5 sessions so far")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete project: Thesis" }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("archives and restores", async () => {
    const view = renderWithIntl(<ProjectHeader project={thesis} stats={undefined} pro onEdit={vi.fn()} onDelete={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(store().projects.thesis!.archived).toBe(true);

    view.unmount();
    renderWithIntl(<ProjectHeader project={store().projects.thesis!} stats={undefined} pro onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("Thesis (archived)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Unarchive" }));
    expect(store().projects.thesis!.archived).toBe(false);
  });

  it("is read only without Pro", () => {
    renderWithIntl(<ProjectHeader project={thesis} stats={undefined} pro={false} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("Thesis")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("ProjectPicker", () => {
  it("lists 'no project' and live projects, with the current one checked", () => {
    seed({ projects: [thesis, math, old] });
    renderWithIntl(<ProjectPicker value="math" onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "No project" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Math" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Thesis" })).toBeInTheDocument();
    // Archived projects are hidden unless the task is already in one.
    expect(screen.queryByRole("radio", { name: /Old exam/ })).not.toBeInTheDocument();
  });

  it("keeps showing the archived project a task is already in", () => {
    seed({ projects: [thesis, old] });
    renderWithIntl(<ProjectPicker value="old" onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Old exam (archived)" })).toBeChecked();
  });

  it("treats a deleted project as 'no project'", () => {
    renderWithIntl(<ProjectPicker value="gone" onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "No project" })).toBeChecked();
  });

  it("reports a pick", async () => {
    const onChange = vi.fn();
    renderWithIntl(<ProjectPicker value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Thesis" }));
    expect(onChange).toHaveBeenCalledWith("thesis");
  });

  it("filters by search, case-insensitively", async () => {
    renderWithIntl(<ProjectPicker value={null} onChange={vi.fn()} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search projects" }), "MAT");
    expect(screen.getByRole("radio", { name: "Math" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Thesis" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "No project" })).not.toBeInTheDocument();
  });

  it("creates a project from the search text and picks it", async () => {
    const onChange = vi.fn();
    renderWithIntl(<ProjectPicker value={null} onChange={onChange} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search projects" }), "Garden");
    await userEvent.click(screen.getByRole("button", { name: "Create “Garden”" }));
    const created = Object.values(store().projects).find((p) => p.name === "Garden");
    expect(created).toBeDefined();
    expect(onChange).toHaveBeenCalledWith(created!.id);
    expect(screen.getByRole("searchbox", { name: "Search projects" })).toHaveValue("");
  });

  it("does not offer to create a name that already exists", async () => {
    renderWithIntl(<ProjectPicker value={null} onChange={vi.fn()} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search projects" }), "thesis");
    expect(screen.queryByRole("button", { name: /Create/ })).not.toBeInTheDocument();
  });

  it("is disabled when locked", () => {
    renderWithIntl(<ProjectPicker value={null} onChange={vi.fn()} disabled />);
    expect(screen.getByRole("radio", { name: "Thesis" })).toBeDisabled();
    expect(screen.getByRole("searchbox", { name: "Search projects" })).toBeDisabled();
  });
});

describe("ProjectsDialog", () => {
  const props = () => ({
    open: true,
    onClose: vi.fn(),
    stats: stats({ thesis: { active: 2, done: 1, sessions: 4 }, math: {}, old: { done: 3 } }),
    onOpenProject: vi.fn(),
    onNew: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  });

  it("lists live projects with their numbers", () => {
    seed({ projects: [thesis, math, old] });
    renderWithIntl(<ProjectsDialog {...props()} />);
    expect(screen.getByText("2 active · 1 done · 4 sessions")).toBeInTheDocument();
    expect(screen.getByText("Math")).toBeInTheDocument();
    expect(screen.queryByText("Old exam")).not.toBeInTheDocument();
  });

  it("opens a project's tasks and closes", async () => {
    const p = props();
    renderWithIntl(<ProjectsDialog {...p} />);
    await userEvent.click(screen.getByRole("button", { name: /^Thesis/ }));
    expect(p.onOpenProject).toHaveBeenCalledWith("thesis");
    expect(p.onClose).toHaveBeenCalled();
  });

  it("starts new, edit and delete", async () => {
    const p = props();
    renderWithIntl(<ProjectsDialog {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "New project" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit “Thesis”" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete project: Math" }));
    expect(p.onNew).toHaveBeenCalledOnce();
    expect(p.onEdit).toHaveBeenCalledWith(thesis);
    expect(p.onDelete).toHaveBeenCalledWith(math);
  });

  it("folds archived projects away and restores one", async () => {
    seed({ projects: [thesis, old] });
    renderWithIntl(<ProjectsDialog {...props()} />);
    const toggle = screen.getByRole("button", { name: "Archived (1)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Old exam")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Unarchive" }));
    expect(store().projects.old!.archived).toBe(false);
  });

  it("shows an empty state", () => {
    seed({ projects: [] });
    renderWithIntl(<ProjectsDialog {...props()} />);
    expect(screen.getByText("You have no projects yet.")).toBeInTheDocument();
  });

  it("is read only without Pro, with a way to upgrade", () => {
    seed({ pro: false });
    renderWithIntl(<ProjectsDialog {...props()} />);
    expect(screen.queryByRole("button", { name: "New project" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit “Thesis”" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete project: Thesis" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/pricing");
  });
});

describe("ProjectsUpsell", () => {
  it("explains projects and links to Pricing", async () => {
    const onClose = vi.fn();
    renderWithIntl(<ProjectsUpsell open onClose={onClose} />);
    expect(screen.getByRole("heading", { name: "Organize your tasks into projects" })).toBeInTheDocument();
    expect(screen.getByText("Unlimited tasks instead of 10 active")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/pricing");
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("TaskAddForm", () => {
  it("adds into the selected project and says where the task goes", async () => {
    renderWithIntl(<TaskAddForm disabled={false} project={thesis} />);
    const input = screen.getByRole("textbox", { name: "New task" });
    expect(input).toHaveAttribute("placeholder", "New task in “Thesis”…");
    expect(input).toHaveAccessibleDescription("Goes to project: Thesis");
    await userEvent.type(input, "Write chapter 2{Enter}");
    expect(liveTasks()).toEqual([expect.objectContaining({ title: "Write chapter 2", projectId: "thesis" })]);
    expect(input).toHaveValue("");
  });

  it("adds without a project otherwise", async () => {
    renderWithIntl(<TaskAddForm disabled={false} />);
    const input = screen.getByRole("textbox", { name: "New task" });
    expect(input).toHaveAttribute("placeholder", "Add a new task…");
    await userEvent.type(input, "Plain{Enter}");
    expect(liveTasks()[0]!.projectId).toBeNull();
  });

  it("keeps the text when the add is refused", async () => {
    seed({ pro: false });
    renderWithIntl(<TaskAddForm disabled={false} project={thesis} />);
    const input = screen.getByRole("textbox", { name: "New task" });
    await userEvent.type(input, "Write{Enter}");
    expect(liveTasks()).toHaveLength(0);
    expect(input).toHaveValue("Write");
  });
});

describe("TaskFilterBar", () => {
  it("filters by tag", async () => {
    const onChange = vi.fn();
    const tags = [{ id: "t1", name: "urgent", createdAt: "", updatedAt: "", deletedAt: null }];
    renderWithIntl(<TaskFilterBar tag="" onChange={onChange} tags={tags} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Tag" }), "urgent");
    expect(onChange).toHaveBeenCalledWith("t1");
  });
});
