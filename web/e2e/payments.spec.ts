import { expect, test } from "@playwright/test";
import { cleanup, closeDb, oneDevice, postTasks, query, taskBody } from "./helpers";

test.afterEach(async () => {
  await cleanup();
});

test.afterAll(async () => {
  await closeDb();
});

test("pricing pays through the fake gateway and grants Pro once", async ({ browser, request }) => {
  // No authority: the fake page does not exist.
  expect((await request.get("/api/test/pay")).status()).toBe(404);

  const { page, userId } = await oneDevice(browser);
  await page.goto("/en/pricing");
  await page.getByRole("button", { name: "Pay with Zarinpal" }).click();
  await page.waitForURL("**/api/test/pay?**");
  const authority = new URL(page.url()).searchParams.get("authority");
  expect(authority).toBeTruthy();

  await page.getByRole("link", { name: "Pay" }).click();
  await expect(page.getByRole("heading", { name: "Payment complete" })).toBeVisible();
  const receipt = page.getByText(/Reference:/).first();
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText("Pro is active until");

  const before = await proUntil(userId);
  expect(before).toBeGreaterThan(Date.now() + 360 * 86_400_000);

  await page.goto(`/api/payments/callback?Authority=${authority}&Status=OK`);
  await expect(page.getByRole("heading", { name: "Payment complete" })).toBeVisible();
  expect(await proUntil(userId)).toBe(before);

  const noted = taskBody({ notes: "Bought with the test gateway" });
  const result = await postTasks(page, { tasks: [noted] });
  expect(result.results[0]).toMatchObject({ status: "applied" });
});

async function proUntil(userId: string): Promise<number> {
  const rows = await query<{ proUntil: Date | string | null }>(`SELECT "proUntil" FROM "user" WHERE id = $1`, [userId]);
  const value = rows[0]?.proUntil;
  if (!value) throw new Error("Pro was not granted");
  return new Date(value).getTime();
}
