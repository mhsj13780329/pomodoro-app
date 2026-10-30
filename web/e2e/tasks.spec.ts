import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  activeTaskCount,
  query,
  activeTimerRow,
  clickAndSync,
  openTimer,
  sessionTaskIds,
  setFocusMinutes,
  cleanup,
  closeDb,
  oneDevice,
  postTasks,
  setProUntil,
  taskBody,
  taskRowById,
  timerTaskId,
  twoDevices,
} from "./helpers";

test.afterEach(async () => {
  await cleanup();
});

test.afterAll(async () => {
  await closeDb();
});

test.describe("tasks API", () => {
  test("a free account is stopped at 10 active tasks, and done tasks do not count", async ({ browser }) => {
    const { page, userId } = await oneDevice(browser);

    const ten = Array.from({ length: 10 }, (_, index) => taskBody({ title: `Task ${index}`, order: index }));
    const first = await postTasks(page, { tasks: ten });
    expect(first.results.every((result) => result.status === "applied")).toBe(true);
    expect(await activeTaskCount(userId)).toBe(10);

    const eleventh = taskBody({ title: "Eleventh" });
    const second = await postTasks(page, { tasks: [eleventh] });
    expect(second.results[0]).toMatchObject({ status: "rejected", reason: "active_limit" });
    expect(await taskRowById(eleventh.id)).toBeNull();
    expect(await activeTaskCount(userId)).toBe(10);

    // Finishing one frees a place.
    const finished = { ...ten[0]!, done: true, doneAt: new Date().toISOString(), updatedAt: new Date(Date.now() + 1000).toISOString() };
    expect((await postTasks(page, { tasks: [finished] })).results[0]?.status).toBe("applied");
    expect((await postTasks(page, { tasks: [eleventh] })).results[0]?.status).toBe("applied");
    expect(await activeTaskCount(userId)).toBe(10);

    // Un-checking the finished task now would be an 11th active task.
    const reopened = { ...finished, done: false, doneAt: null, updatedAt: new Date(Date.now() + 2000).toISOString() };
    const result = await postTasks(page, { tasks: [reopened] });
    expect(result.results[0]).toMatchObject({ status: "rejected", reason: "active_limit" });
    expect(result.rows.tasks[0]).toMatchObject({ id: finished.id, done: true });
  });

  test("a parallel flush cannot slip past the limit", async ({ browser }) => {
    const { page, userId } = await oneDevice(browser);
    const batches = Array.from({ length: 4 }, (_, batch) =>
      Array.from({ length: 5 }, (_, index) => taskBody({ title: `B${batch}-${index}` })),
    );
    await Promise.all(batches.map((tasks) => postTasks(page, { tasks })));
    expect(await activeTaskCount(userId)).toBe(10);
  });

  test("a free account cannot create Pro-only data, even by calling the API directly", async ({ browser }) => {
    const { page } = await oneDevice(browser);
    const project = { id: randomUUID(), name: "Uni", color: "focus", archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null };

    const projectResult = await postTasks(page, { projects: [project] });
    expect(projectResult.results[0]).toMatchObject({ kind: "project", status: "rejected", reason: "pro_required" });

    const withEstimate = taskBody({ estimatePomodoros: 3 });
    const withNotes = taskBody({ notes: "secret plan" });
    const result = await postTasks(page, { tasks: [withEstimate, withNotes] });
    expect(result.results.map((item) => item.reason)).toEqual(["pro_required", "pro_required"]);
    expect(await taskRowById(withEstimate.id)).toBeNull();
  });

  test("when Pro ends the data stays readable and editable, but nothing new Pro can be added", async ({ browser }) => {
    const { page, userId } = await oneDevice(browser);
    await setProUntil(userId, new Date(Date.now() + 60 * 60_000));

    const project = { id: randomUUID(), name: "Uni", color: "short", archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null };
    const task = taskBody({ title: "Physics", projectId: project.id, estimatePomodoros: 4, notes: "ch 3" });
    const created = await postTasks(page, { projects: [project], tasks: [task] });
    expect(created.results.map((item) => item.status)).toEqual(["applied", "applied"]);
    expect(created.pro).toBe(true);

    await setProUntil(userId, new Date(Date.now() - 60_000));

    // The pull still returns everything.
    const pulled = (await (await page.request.get("/api/sync/state?tasksSince=0")).json()) as {
      tasks: { pro: boolean; projects: { id: string }[]; tasks: { id: string; estimatePomodoros: number | null }[] };
    };
    expect(pulled.tasks.pro).toBe(false);
    expect(pulled.tasks.projects.map((item) => item.id)).toEqual([project.id]);
    expect(pulled.tasks.tasks[0]).toMatchObject({ id: task.id, estimatePomodoros: 4 });

    // Checking it off keeps the project and estimate.
    const later = (ms: number) => new Date(Date.now() + ms).toISOString();
    const finished = { ...task, done: true, doneAt: later(0), updatedAt: later(1000) };
    expect((await postTasks(page, { tasks: [finished] })).results[0]?.status).toBe("applied");
    expect(await taskRowById(task.id)).toMatchObject({ done: true, projectId: project.id });

    // New Pro items and changes are refused.
    const another = { ...project, id: randomUUID() };
    expect((await postTasks(page, { projects: [another] })).results[0]).toMatchObject({ status: "rejected", reason: "pro_required" });
    const bigger = { ...finished, estimatePomodoros: 9, updatedAt: later(2000) };
    expect((await postTasks(page, { tasks: [bigger] })).results[0]).toMatchObject({ status: "rejected", reason: "pro_required" });

    // Nothing was deleted by the downgrade.
    expect(await taskRowById(task.id)).toMatchObject({ projectId: project.id });
  });

  test("last write wins, a retry changes nothing, and a delete is final", async ({ browser }) => {
    const { page } = await oneDevice(browser);
    const base = new Date();
    const task = taskBody({ title: "v1" }, base);
    await postTasks(page, { tasks: [task] });

    const newer = { ...task, title: "v2", updatedAt: new Date(base.getTime() + 5000).toISOString() };
    expect((await postTasks(page, { tasks: [newer] })).results[0]?.status).toBe("applied");

    const older = { ...task, title: "slow old save", updatedAt: new Date(base.getTime() + 1000).toISOString() };
    const stale = await postTasks(page, { tasks: [older] });
    expect(stale.results[0]?.status).toBe("stale");
    expect(stale.rows.tasks[0]?.title).toBe("v2");

    // The same request twice is a retry: stale, and the row is unchanged.
    expect((await postTasks(page, { tasks: [newer] })).results[0]?.status).toBe("stale");
    expect((await taskRowById(task.id))?.title).toBe("v2");

    const deleted = { ...newer, deletedAt: new Date(base.getTime() + 8000).toISOString(), updatedAt: new Date(base.getTime() + 8000).toISOString() };
    expect((await postTasks(page, { tasks: [deleted] })).results[0]?.status).toBe("applied");
    const revived = { ...newer, title: "back", updatedAt: new Date(base.getTime() + 20_000).toISOString() };
    expect((await postTasks(page, { tasks: [revived] })).results[0]?.status).toBe("stale");
    expect(await taskRowById(task.id)).toMatchObject({ title: "v2" });
    expect((await taskRowById(task.id))?.deletedAt).not.toBeNull();
  });

  test("a task id that belongs to someone else is never touched", async ({ browser }) => {
    const mine = await oneDevice(browser);
    const theirs = await oneDevice(browser);
    const task = taskBody({ title: "theirs" });
    await postTasks(theirs.page, { tasks: [task] });

    const hijack = { ...task, title: "mine now", updatedAt: new Date(Date.now() + 5000).toISOString() };
    const result = await postTasks(mine.page, { tasks: [hijack] });
    expect(result.results[0]).toMatchObject({ status: "rejected", reason: "foreign" });
    expect((await taskRowById(task.id))?.title).toBe("theirs");
  });

  test("the timer keeps running when its task is finished or deleted elsewhere", async ({ browser }) => {
    const { page, userId } = await oneDevice(browser);
    const task = taskBody({ title: "Focus on this" });
    await postTasks(page, { tasks: [task] });

    const start = await page.request.post("/api/timer", {
      data: { action: "start", expectedVersion: 0, runId: randomUUID() },
    });
    expect(start.status()).toBe(200);
    const pick = await page.request.post("/api/timer", { data: { action: "setTask", taskId: task.id } });
    expect(pick.status()).toBe(200);
    expect(await timerTaskId(userId)).toBe(task.id);
    const before = ((await pick.json()) as { activeTimer: { version: number; status: string } }).activeTimer;

    const deleted = { ...task, deletedAt: new Date(Date.now() + 1000).toISOString(), updatedAt: new Date(Date.now() + 1000).toISOString() };
    await postTasks(page, { tasks: [deleted] });

    const after = ((await (await page.request.get("/api/sync/state")).json()) as {
      activeTimer: { version: number; status: string; taskId: string | null };
    }).activeTimer;
    expect(after.taskId).toBeNull();
    expect(after.status).toBe("running");
    // No version bump: another device's pause or complete is not forced to conflict.
    expect(after.version).toBe(before.version);
  });

  test("a task that is done, deleted or unknown cannot be picked", async ({ browser }) => {
    const { page, userId } = await oneDevice(browser);
    const finished = taskBody({ done: true, doneAt: new Date().toISOString() });
    await postTasks(page, { tasks: [finished] });
    await page.request.post("/api/timer", { data: { action: "setTask", taskId: finished.id } });
    expect(await timerTaskId(userId)).toBeNull();
    await page.request.post("/api/timer", { data: { action: "setTask", taskId: randomUUID() } });
    expect(await timerTaskId(userId)).toBeNull();
  });
});

/** Waits for the next tasks upload to be answered, so the test knows the server has it. */
function tasksSaved(page: Page) {
  return page.waitForResponse((response) => response.url().endsWith("/api/tasks") && response.request().method() === "POST");
}

async function addTask(page: Page, title: string) {
  await page.getByLabel("New task", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name: `Focus on: ${title}` })).toBeVisible();
}

test.describe("tasks page", () => {
  test("a task added on device A shows up on device B", async ({ browser }) => {
    const { a, b } = await twoDevices(browser);
    await b.page.goto("/en/tasks");
    await expect(b.page.getByText("No tasks yet")).toBeVisible();

    await a.page.goto("/en/tasks");
    await expect(a.page.getByText("No tasks yet")).toBeVisible();
    const saved = tasksSaved(a.page);
    await addTask(a.page, "Read chapter 3");
    expect((await saved).status()).toBe(200);

    // B refreshes on focus, the same trigger as coming back to the tab.
    await b.page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(b.page.getByRole("button", { name: "Focus on: Read chapter 3" })).toBeVisible();
    await expect(b.page.getByText("1 of 10 active tasks")).toBeVisible();
  });

  test("the 11th active task is refused for a free user, and finishing one makes room", async ({ browser }) => {
    const { page } = await oneDevice(browser);
    const ten = Array.from({ length: 10 }, (_, index) => taskBody({ title: `Task ${index}`, order: index }));
    await postTasks(page, { tasks: ten });

    await page.goto("/en/tasks");
    await expect(page.getByText("10 of 10 active tasks")).toBeVisible();
    await expect(page.getByLabel("New task", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Add", exact: true })).toBeDisabled();
    await expect(page.getByText("You have reached the limit of 10 active tasks")).toBeVisible();

    await page.getByRole("checkbox", { name: "Done: Task 0" }).check();
    await expect(page.getByText("9 of 10 active tasks")).toBeVisible();
    await expect(page.getByLabel("New task", { exact: true })).toBeEnabled();
    await expect(page.getByRole("heading", { name: "Done (1)" })).toBeVisible();

    // The freed place is used up again, so re-opening the finished task would make an 11th.
    await addTask(page, "Task 10");
    await expect(page.getByText("10 of 10 active tasks")).toBeVisible();
    // A plain click: the box is refused and springs back, so it never changes state.
    await page.getByRole("checkbox", { name: "Done: Task 0" }).click();
    await expect(page.getByText("That task was not added because the limit of 10 active tasks is full.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Done (1)" })).toBeVisible();
  });

  test("add, rename, reorder, pick, finish and delete work and are saved", async ({ browser }) => {
    const { page, userId } = await oneDevice(browser);
    await page.goto("/en/tasks");
    await expect(page.getByText("No tasks yet")).toBeVisible();

    for (const title of ["One", "Two", "Three"]) await addTask(page, title);
    const titles = page.getByRole("button", { name: /^Focus on:/ });
    await expect(titles).toHaveText(["One", "Two", "Three"]);

    // Reorder without dragging: the first row cannot go up.
    await page.getByRole("button", { name: "Options for One" }).click();
    await expect(page.getByRole("button", { name: "Move up" })).toBeDisabled();
    await page.getByRole("button", { name: "Options for Three" }).click();
    await page.getByRole("button", { name: "Move up" }).click();
    await expect(titles).toHaveText(["One", "Three", "Two"]);

    // Rename with the keyboard: Enter saves, Escape cancels.
    await page.getByRole("button", { name: "Options for One" }).click();
    await page.getByRole("button", { name: "Rename" }).click();
    await page.getByRole("textbox", { name: "Task name" }).fill("Uno");
    await page.keyboard.press("Enter");
    await expect(titles).toHaveText(["Uno", "Three", "Two"]);
    await page.getByRole("button", { name: "Options for Uno" }).click();
    await page.getByRole("button", { name: "Rename" }).click();
    await page.getByRole("textbox", { name: "Task name" }).fill("Nope");
    await page.keyboard.press("Escape");
    await expect(titles).toHaveText(["Uno", "Three", "Two"]);

    // Picking marks the row as the current one.
    await page.getByRole("button", { name: "Focus on: Uno" }).click();
    await expect(page.getByRole("button", { name: "Focus on: Uno" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Focusing", { exact: true })).toBeVisible();

    await page.getByRole("checkbox", { name: "Done: Two" }).check();
    await expect(page.getByRole("heading", { name: "Done (1)" })).toBeVisible();
    await page.getByRole("button", { name: "Options for Three" }).click();
    await page.getByRole("button", { name: "Delete: Three" }).click();
    await expect(titles).toHaveText([/^Uno/]);

    // The server ends up with the same list.
    await expect.poll(() => activeTaskCount(userId)).toBe(1);
    await page.reload();
    await expect(titles).toHaveText([/^Uno/]);
    await expect(page.getByRole("heading", { name: "Done (1)" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Focus on: Uno" })).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("tasks and the timer", () => {
  test("a focus that finishes with a task picked is saved against that task", async ({ browser }) => {
    const { page, userId } = await oneDevice(browser);
    await setFocusMinutes(page, 1);
    const task = taskBody({ title: "Physics" });
    await postTasks(page, { tasks: [task] });

    await openTimer(page);
    await page.getByRole("button", { name: "Focus on: Physics" }).click();
    await expect.poll(() => timerTaskId(userId)).toBe(task.id);

    await clickAndSync(page, "Start");
    await expect(page.getByRole("timer")).toHaveAttribute("aria-label", /break/i, { timeout: 90_000 });
    await expect.poll(() => sessionTaskIds(userId)).toEqual([task.id]);

    // The row's count is derived from that session.
    await page.goto("/en/tasks");
    await expect(page.getByRole("button", { name: "Focus on: Physics" })).toBeVisible();
    await expect(page.getByText("1 session", { exact: true })).toBeVisible();
  });

  test("a task deleted on device B does not break the timer running on device A", async ({ browser }) => {
    const { a, b, userId } = await twoDevices(browser);
    const task = taskBody({ title: "Doomed" });
    await postTasks(a.page, { tasks: [task] });

    // A is a phone: it picks the task in the picker dialog.
    await a.page.setViewportSize({ width: 390, height: 844 });
    await openTimer(a.page);
    await a.page.getByRole("button", { name: "Current task: No task. Change" }).click();
    await a.page.getByRole("radio", { name: "Doomed" }).click();
    await expect(a.page.getByRole("dialog")).toBeHidden();
    await expect(a.page.getByRole("button", { name: "Current task: Doomed. Change" })).toBeVisible();
    await expect.poll(() => timerTaskId(userId)).toBe(task.id);
    await clickAndSync(a.page, "Start");

    await b.page.goto("/en/tasks");
    await b.page.getByRole("button", { name: "Options for Doomed" }).click();
    const saved = tasksSaved(b.page);
    await b.page.getByRole("button", { name: "Delete: Doomed" }).click();
    expect((await saved).status()).toBe(200);

    await a.page.evaluate(() => window.dispatchEvent(new Event("focus")));
    // The pick is cleared quietly (the app shows no message for it), and the timer is still running.
    await expect(a.page.getByRole("button", { name: "Current task: No task. Change" })).toBeVisible();
    await expect(a.page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    expect(await timerTaskId(userId)).toBeNull();
    expect((await activeTimerRow(userId))?.status.toLowerCase()).toBe("running");
  });
});

const IN_30_DAYS = () => new Date(Date.now() + 30 * 86_400_000);

test.describe("Pro task features", () => {
  test("a Pro account can use estimates, projects, tags, notes and subtasks, and they are saved", async ({ browser }) => {
    const { page, userId } = await oneDevice(browser);
    await setProUntil(userId, IN_30_DAYS());
    await page.goto("/en/tasks");
    await expect(page.getByText("0 active tasks")).toBeVisible();
    await addTask(page, "Essay");

    // A project, made in the manager.
    await page.getByRole("button", { name: "Manage projects" }).click();
    const projects = page.getByRole("dialog", { name: "Projects" });
    await projects.getByRole("textbox", { name: "Project name" }).fill("Uni");
    await projects.getByRole("button", { name: "Add project" }).click();
    await expect(projects.getByRole("textbox", { name: "Project name" }).first()).toHaveValue("Uni");
    await projects.getByRole("button", { name: "Close" }).click();

    // Everything else, in the task's details.
    await page.getByRole("button", { name: "Options for Essay" }).click();
    await page.getByRole("button", { name: "Details" }).click();
    const details = page.getByRole("dialog", { name: "Details: Essay" });
    await details.getByRole("button", { name: "One more session" }).click();
    await details.getByRole("button", { name: "One more session" }).click();
    await expect(details.getByText("2 sessions")).toBeVisible();
    await details.getByLabel("Project", { exact: true }).selectOption({ label: "Uni" });
    await details.getByRole("textbox", { name: "New tag" }).fill("exam");
    await details.getByRole("button", { name: "Add tag" }).click();
    await expect(details.getByRole("checkbox", { name: "exam" })).toBeChecked();
    await details.getByRole("textbox", { name: "New subtask" }).fill("Outline");
    await details.getByRole("button", { name: "Add", exact: true }).click();
    await expect(details.getByRole("checkbox", { name: "Done: Outline" })).toBeVisible();
    // Escape closes the dialog without leaving the box, and the note must still be saved.
    await details.getByRole("textbox", { name: "Notes" }).fill("Outline first");
    await page.keyboard.press("Escape");
    await expect(details).toBeHidden();

    const row = page.getByRole("listitem").filter({ hasText: "Essay" });
    await expect(row).toContainText("Uni");
    await expect(row).toContainText("exam");
    await expect(row).toContainText("0 of 1 subtasks");
    await expect(row).toContainText("0 of 2");

    await expect
      .poll(async () => {
        const rows = await query<{ est: number | null; notes: string | null; project: string | null; subs: number; tags: number }>(
          `SELECT t."estimatePomodoros" AS est, t.notes, p.name AS project,
                  (SELECT count(*)::int FROM "Task" c WHERE c."parentId" = t.id AND c."deletedAt" IS NULL) AS subs,
                  (SELECT count(*)::int FROM "TaskTag" x WHERE x."taskId" = t.id) AS tags
             FROM "Task" t LEFT JOIN "Project" p ON p.id = t."projectId"
            WHERE t."userId" = $1 AND t.title = 'Essay'`,
          [userId],
        );
        return rows[0];
      })
      .toEqual({ est: 2, notes: "Outline first", project: "Uni", subs: 1, tags: 1 });

    // The filter narrows the list.
    await page.getByLabel("Project", { exact: true }).selectOption({ label: "No project" });
    await expect(page.getByRole("button", { name: "Focus on: Essay" })).toHaveCount(0);
    await expect(page.getByText("No tasks match this filter.")).toBeVisible();
    await page.getByLabel("Project", { exact: true }).selectOption({ label: "Uni" });
    await expect(page.getByRole("button", { name: "Focus on: Essay" })).toBeVisible();
  });

  test("a free account sees the Pro lock, and the Upgrade link goes to Pricing", async ({ browser }) => {
    const { page } = await oneDevice(browser);
    await page.goto("/en/tasks");
    await addTask(page, "Plain");
    await page.getByRole("button", { name: "Options for Plain" }).click();
    await page.getByRole("button", { name: "Details" }).click();
    const details = page.getByRole("dialog", { name: "Details: Plain" });
    await expect(details.getByText("These sections are for Pro.")).toBeVisible();
    await expect(details.getByRole("button", { name: "One more session" })).toBeDisabled();
    await expect(details.getByRole("textbox", { name: "Notes" })).toBeDisabled();
    await expect(details.getByRole("textbox", { name: "New subtask" })).toBeDisabled();

    await details.getByRole("link", { name: "Upgrade to Pro" }).click();
    await page.waitForURL("**/en/pricing");
    await expect(page.getByText("The pricing page is coming soon.")).toBeVisible();
  });

  test("when Pro ends, the data stays visible but read-only, and open work can still be finished", async ({ browser }) => {
    const { page, userId } = await oneDevice(browser);
    await setProUntil(userId, IN_30_DAYS());
    const now = new Date().toISOString();
    const project = { id: randomUUID(), name: "Uni", color: "focus", archived: false, createdAt: now, updatedAt: now, deletedAt: null };
    const parent = taskBody({ title: "Thesis", projectId: project.id, estimatePomodoros: 3, notes: "chapter plan" });
    const child = taskBody({ title: "Outline", parentId: parent.id });
    const sent = await postTasks(page, { projects: [project], tasks: [parent, child] });
    expect(sent.results.every((result) => result.status === "applied")).toBe(true);
    await setProUntil(userId, new Date(Date.now() - 1000));

    await page.goto("/en/tasks");
    const row = page.getByRole("listitem").filter({ hasText: "Thesis" });
    await expect(row).toContainText("Uni");
    await expect(row).toContainText("0 of 3");

    await page.getByRole("button", { name: "Options for Thesis" }).click();
    await page.getByRole("button", { name: "Details" }).click();
    const details = page.getByRole("dialog", { name: "Details: Thesis" });
    await expect(details.getByText("These sections are for Pro.")).toBeVisible();
    await expect(details.getByRole("textbox", { name: "Notes" })).toHaveValue("chapter plan");
    await expect(details.getByRole("textbox", { name: "Notes" })).toBeDisabled();
    await expect(details.getByText("3 sessions")).toBeVisible();
    await expect(details.getByRole("button", { name: "One more session" })).toBeDisabled();
    await expect(details.getByRole("textbox", { name: "New subtask" })).toBeDisabled();

    // Finishing an existing subtask is not a Pro action.
    const done = tasksSaved(page);
    await details.getByRole("checkbox", { name: "Done: Outline" }).check();
    expect((await done).status()).toBe(200);
    await expect
      .poll(async () => (await query<{ done: boolean }>(`SELECT done FROM "Task" WHERE id = $1`, [child.id]))[0]?.done)
      .toBe(true);
    await details.getByRole("button", { name: "Close" }).click();

    // New Pro items stay blocked, and nothing was deleted.
    await page.getByRole("button", { name: "Manage projects" }).click();
    const projects = page.getByRole("dialog", { name: "Projects" });
    await expect(projects.getByRole("button", { name: "Add project" })).toBeDisabled();
    await expect(projects.getByRole("textbox", { name: "Project name" }).first()).toHaveValue("Uni");
  });
});
