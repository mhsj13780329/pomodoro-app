import { expect, test } from "@playwright/test";
import {
  SYNC_ROUTES,
  activeTimerRow,
  cleanup,
  clickAndSync,
  closeDb,
  expectSameRing,
  focusSessionCount,
  idbKeys,
  oneDevice,
  openSettings,
  openTimer,
  readRing,
  setFocusMinutes,
  twoDevices,
} from "./helpers";

const BREAK = "Time for a break";

test.afterEach(async () => {
  await cleanup();
});

test.afterAll(async () => {
  await closeDb();
});

test("start, pause, resume, skip and reset reach the other device", async ({ browser }) => {
  const { a, b } = await twoDevices(browser);
  await openTimer(a.page);
  await openTimer(b.page);

  const steps = [
    { click: "Start", running: true },
    { click: "Pause", running: false },
    { click: "Start", running: true },
    { click: "Skip", running: false, subtitle: BREAK },
    // Reset on an idle phase changes nothing, so run the break first.
    { click: "Start", running: true },
    { click: "Reset", running: false, subtitle: BREAK },
  ];
  for (const step of steps) {
    await test.step(step.click, async () => {
      await clickAndSync(a.page, step.click);
      const local = await readRing(a.page);
      expect(local.running).toBe(step.running);
      if (step.subtitle) expect(local.subtitle).toBe(step.subtitle);
      await openTimer(b.page, true);
      await expectSameRing(a.page, b.page);
    });
  }
  expect((await readRing(b.page)).seconds).toBe(5 * 60);
});

test("a focus that ends on two open devices is saved once", async ({ browser }) => {
  const { a, b, userId } = await twoDevices(browser);
  await setFocusMinutes(a.page, 1);
  await openTimer(a.page);
  await openTimer(b.page);
  expect((await readRing(a.page)).seconds).toBe(60);

  await clickAndSync(a.page, "Start");
  await openTimer(b.page, true);
  await expectSameRing(a.page, b.page);

  for (const page of [a.page, b.page]) {
    await expect(page.getByRole("timer")).toHaveAttribute("aria-label", new RegExp(BREAK), {
      timeout: 90_000,
    });
  }
  await expect.poll(() => focusSessionCount(userId)).toBe(1);
  // Let both devices finish their complete and session uploads before the final count.
  await a.page.waitForTimeout(3_000);
  expect(await focusSessionCount(userId)).toBe(1);
});

test("a device whose clock is five minutes ahead shows the same time", async ({ browser }) => {
  const { a, b } = await twoDevices(browser);
  await a.page.clock.install({ time: Date.now() + 5 * 60_000 });
  await a.page.clock.resume();
  await openTimer(a.page);
  await openTimer(b.page);
  const skew = (await a.page.evaluate(() => Date.now())) - Date.now();
  expect(skew).toBeGreaterThan(4.5 * 60_000);

  await clickAndSync(a.page, "Start");
  // With no offset correction A would think five minutes had already passed.
  expect((await readRing(a.page)).seconds).toBeGreaterThanOrEqual(25 * 60 - 2);
  await openTimer(b.page, true);
  await expectSameRing(a.page, b.page);
});

test("a focus finished offline is queued, survives a reopen and syncs once", async ({ browser }) => {
  const { context, page, userId } = await oneDevice(browser);
  await setFocusMinutes(page, 1);
  await openTimer(page);
  await clickAndSync(page, "Start");

  await openSettings(page);
  await context.setOffline(true);
  await expect(page.getByRole("status")).toHaveText(/\b1 waiting/, { timeout: 90_000 });
  expect(await focusSessionCount(userId)).toBe(0);

  // Reopen while the sync endpoints are still unreachable: the queue must come back from IndexedDB.
  await page.close();
  await context.route(SYNC_ROUTES, (route) => route.abort("internetdisconnected"));
  await context.setOffline(false);
  const reopened = await context.newPage();
  await reopened.goto("/en/settings");
  await expect(reopened.getByRole("status")).toHaveText(/\b1 waiting/);
  expect(await focusSessionCount(userId)).toBe(0);

  await context.unroute(SYNC_ROUTES);
  await expect(reopened.getByRole("status")).toHaveText("Synced", { timeout: 30_000 });
  await expect.poll(() => focusSessionCount(userId)).toBe(1);
  await reopened.waitForTimeout(3_000);
  expect(await focusSessionCount(userId)).toBe(1);
});

test("a focus length changed on one device reaches the other", async ({ browser }) => {
  const { a, b } = await twoDevices(browser);
  const saved = a.page.waitForResponse(
    (response) => response.url().endsWith("/api/settings") && response.request().method() === "PUT",
  );
  await a.page.getByRole("button", { name: "50 / 10 / 20" }).click();
  expect((await saved).status()).toBe(200);

  await openSettings(b.page);
  await expect(b.page.getByRole("button", { name: "50 / 10 / 20" })).toHaveAttribute("aria-pressed", "true");
  await expect(b.page.getByText("50 min", { exact: true })).toBeVisible();
  await openTimer(b.page);
  await expect.poll(async () => (await readRing(b.page)).seconds).toBe(50 * 60);
});

test("the server rejects a complete with time still left", async ({ browser }) => {
  const { page, userId } = await oneDevice(browser);
  await openTimer(page);
  await clickAndSync(page, "Start");

  const state = (await (await page.request.get("/api/sync/state")).json()) as {
    activeTimer: { version: number };
  };
  const response = await page.request.post("/api/timer", {
    data: { action: "complete", expectedVersion: state.activeTimer.version },
  });
  expect(response.status()).toBe(422);
  expect(((await response.json()) as { error: string }).error).toBe("too_early");
  expect(await focusSessionCount(userId)).toBe(0);
  expect(await activeTimerRow(userId)).toMatchObject({ status: "RUNNING", phase: "FOCUS" });
});

test("logout clears the device and drops the unsynced queue", async ({ browser }) => {
  const { context, page, userId } = await oneDevice(browser);
  await openTimer(page);
  await clickAndSync(page, "Start");

  await context.setOffline(true);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible();

  // Back online for the page itself, but the pause can still not reach the server.
  await context.route(SYNC_ROUTES, (route) => route.abort("internetdisconnected"));
  await context.setOffline(false);
  await page.goto("/en/settings");
  await expect(page.getByRole("status")).toHaveText(/\b1 waiting/);

  const timerPosts: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/timer")) timerPosts.push(request.url());
  });
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("link", { name: "Log in or sign up to sync" })).toBeVisible();

  expect(await idbKeys(page)).toEqual([]);
  const stored = await page.evaluate(() => localStorage.getItem("pomodoro-timer"));
  expect(JSON.parse(stored ?? "{}").state).toMatchObject({ status: "idle", phase: "focus", focusSec: 25 * 60, version: 0 });

  await context.unroute(SYNC_ROUTES);
  timerPosts.length = 0;
  await page.goto("/en");
  await expect(page.getByRole("timer")).toHaveAttribute("aria-label", "25:00 Session 1 of 4");
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible();
  await page.waitForTimeout(3_000);
  expect(timerPosts).toEqual([]);
  expect(await activeTimerRow(userId)).toMatchObject({ status: "RUNNING" });
});
