import { expect, test } from "@playwright/test";
import { activeTaskCount, closeDb, deleteUser, focusSessionCount, login, readRing, sessionTaskIds, uniqueEmail, userIdOf } from "./helpers";

test.afterAll(async () => {
  await closeDb();
});

test("a guest's tasks and finished focus are on the account after signing in", async ({ browser }) => {
  const email = uniqueEmail();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    // Fake clock so the 25-minute focus (guests only get the presets) can be finished without waiting.
    await page.clock.install({ time: Date.now() });
    await page.clock.resume();

    await page.goto("/en/tasks");
    for (const title of ["Write report", "Read paper"]) {
      await page.getByLabel("New task").fill(title);
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await expect(page.getByText(title)).toBeVisible();
    }

    await page.goto("/en");
    await page.getByRole("button", { name: "Focus on: Write report" }).first().click();
    const before = (await readRing(page)).subtitle;
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.clock.fastForward("25:10");
    await expect.poll(async () => (await readRing(page)).subtitle).not.toBe(before);

    await login(page, email);

    const userId = await userIdOf(email);
    await expect.poll(() => activeTaskCount(userId)).toBe(2);
    await expect.poll(() => focusSessionCount(userId)).toBe(1);
    const taskIds = await sessionTaskIds(userId);
    expect(taskIds).toHaveLength(1);
    expect(taskIds[0]).not.toBeNull();
  } finally {
    await context.close();
    await deleteUser(email);
  }
});
