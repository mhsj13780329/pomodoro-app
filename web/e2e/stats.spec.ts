import { expect, test } from "@playwright/test";
import {
  cleanup,
  clickAndSync,
  closeDb,
  focusSessionCount,
  oneDevice,
  openTimer,
  query,
  setFocusMinutes,
  setProUntil,
  twoDevices,
} from "./helpers";

const BREAK = "Time for a break";

test.afterEach(async () => {
  await cleanup();
});

test.afterAll(async () => {
  await closeDb();
});

function civilToday(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const bag: Record<string, string> = {};
  for (const part of parts) bag[part.type] = part.value;
  return `${bag.year}-${bag.month}-${bag.day}`;
}

test("completing a focus updates today and the streak on both devices", async ({ browser }) => {
  const { a, b } = await twoDevices(browser);
  await setFocusMinutes(a.page, 1);
  await openTimer(a.page);
  await openTimer(b.page);
  await a.page.getByRole("button", { name: "Start", exact: true }).click();

  await expect(a.page.getByRole("timer")).toHaveAttribute("aria-label", new RegExp(BREAK), { timeout: 90_000 });
  await expect(a.page.getByRole("link", { name: "1 day in a row" })).toBeVisible();
  await expect(a.page.getByText("Focus time").locator("xpath=..")).toContainText("0:01");

  // The other device learns about the session on its stats poll, not the timer pull.
  await expect(b.page.getByRole("link", { name: "1 day in a row" })).toBeVisible({ timeout: 45_000 });
  await expect(b.page.getByText("Focus time").locator("xpath=..")).toContainText("0:01");
});

test("a free account is refused history and export, and Pro is not", async ({ browser }) => {
  const device = await oneDevice(browser);
  const zone = (
    await query<{ timezone: string }>(`SELECT timezone FROM "user" WHERE id = $1`, [device.userId])
  )[0]?.timezone ?? "Asia/Tehran";
  const today = civilToday(zone);

  const todayResponse = await device.page.request.get(`/api/stats?from=${today}&to=${today}&locale=en`);
  expect(todayResponse.status()).toBe(200);

  const old = await device.page.request.get("/api/stats?from=2020-01-01&to=2020-01-02&locale=en");
  expect(old.status()).toBe(403);
  const breakdown = await device.page.request.get(`/api/stats?from=${today}&to=${today}&breakdown=1&locale=en`);
  expect(breakdown.status()).toBe(403);
  const deniedExport = await device.page.request.get("/api/stats/export?from=2020-01-01&to=2020-01-02&locale=en");
  expect(deniedExport.status()).toBe(403);

  await setProUntil(device.userId, new Date(Date.now() + 24 * 60 * 60_000));
  const allowed = await device.page.request.get("/api/stats?from=2020-01-01&to=2020-01-02&locale=en");
  expect(allowed.status()).toBe(200);
  const exported = await device.page.request.get("/api/stats/export?from=2020-01-01&to=2020-01-02&locale=en");
  expect(exported.status()).toBe(200);
  const bytes = await exported.body();
  // UTF-8 BOM, so Excel reads the Persian headers as Persian.
  expect(bytes[0]).toBe(0xef);
  expect(bytes[1]).toBe(0xbb);
  expect(bytes[2]).toBe(0xbf);
  expect(exported.headers()["content-type"]).toContain("text/csv");
});

test("the Farsi heatmap is the current Jalali month and starts on Saturday", async ({ browser }) => {
  const device = await oneDevice(browser);
  await device.page.goto("/fa/stats");
  const expectedMonth = await device.page.evaluate(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      month: "long",
      year: "numeric",
      timeZone,
    }).format(new Date());
  });
  await expect(device.page.getByRole("heading", { name: expectedMonth })).toBeVisible();
  await expect(device.page.getByRole("columnheader").first()).toHaveText("شنبه");
  await expect(device.page.locator('[aria-current="date"]')).toBeVisible();
});

test("a session finished offline counts today once, including after it syncs", async ({ browser }) => {
  const device = await oneDevice(browser);
  await setFocusMinutes(device.page, 1);
  await openTimer(device.page);
  await clickAndSync(device.page, "Start");
  await device.context.setOffline(true);

  await expect(device.page.getByRole("timer")).toHaveAttribute("aria-label", new RegExp(BREAK), { timeout: 90_000 });
  await expect(device.page.getByRole("link", { name: "1 day in a row" })).toBeVisible();
  await expect(device.page.getByText("Focus time").locator("xpath=..")).toContainText("0:01");
  expect(await focusSessionCount(device.userId)).toBe(0);

  await device.context.setOffline(false);
  await openTimer(device.page, true);
  await expect.poll(() => focusSessionCount(device.userId), { timeout: 20_000 }).toBe(1);
  await device.page.goto("/en/stats");
  await expect(device.page.getByText("Sessions done").locator("xpath=..")).toContainText("1");
  await expect(device.page.getByRole("link", { name: "1 day in a row" })).toBeVisible();
  expect(await focusSessionCount(device.userId)).toBe(1);
});
