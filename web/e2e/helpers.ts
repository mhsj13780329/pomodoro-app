import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { Pool } from "pg";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

// The tests check rows directly, so they read the same DATABASE_URL as the app.
// Plain `pg` instead of the generated Prisma client: Playwright loads test files
// as CommonJS, and the generated client is ESM-only.
config({ path: ".env.local", quiet: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

export async function closeDb() {
  await pool.end();
}

export async function query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

export function uniqueEmail(): string {
  return `e2e-${randomUUID().slice(0, 12)}@example.com`;
}

/** Removes the test account. Sessions, settings, timer and focus rows cascade. */
export async function deleteUser(email: string) {
  await query(`DELETE FROM "user" WHERE email = $1`, [email]);
  await query(`DELETE FROM "OtpRateLimit" WHERE key = ANY($1)`, [
    [`cd:email:${email}`, `burst:email:${email}`],
  ]);
}

export async function userIdOf(email: string): Promise<string> {
  const rows = await query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [email]);
  const id = rows[0]?.id;
  if (!id) throw new Error(`No user for ${email}`);
  return id;
}

export async function focusSessionCount(userId: string): Promise<number> {
  const rows = await query<{ count: string }>(`SELECT count(*)::text AS count FROM "FocusSession" WHERE "userId" = $1`, [userId]);
  return Number(rows[0]?.count ?? 0);
}

export async function activeTimerRow(userId: string) {
  const rows = await query<{ status: string; phase: string; version: number }>(
    `SELECT status::text, phase::text, version FROM "ActiveTimer" WHERE "userId" = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

// Every login sends a code from the same loopback address, and that address
// may send only twenty codes per ten minutes. Clear its counter so repeated
// runs do not lock the suite out.
async function clearLoopbackOtpLimit() {
  await query(`DELETE FROM "OtpRateLimit" WHERE key = ANY($1)`, [
    ["ip:local", "ip:::1", "ip:127.0.0.1", "ip:::ffff:127.0.0.1"],
  ]);
}

async function readOtp(page: Page, email: string): Promise<string> {
  let code = "";
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`/api/test/otp?email=${encodeURIComponent(email)}`);
        if (!response.ok()) return "";
        code = ((await response.json()) as { code: string }).code;
        return code;
      },
      { message: "OTP was not captured; is the server running with E2E_OTP=1?" },
    )
    .toMatch(/^\d{6}$/);
  return code;
}

/** Logs in through the real email OTP screen and waits for sync to settle. */
export async function login(page: Page, email: string) {
  await clearLoopbackOtpLimit();
  await page.goto("/en/login");
  await page.getByRole("tab", { name: "Email" }).click();
  await page.locator("#identifier").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  const code = await readOtp(page, email);
  await page.getByRole("textbox", { name: "Digit 1" }).fill(code);
  await page.getByRole("button", { name: "Confirm" }).click();
  await page.waitForURL("**/en/settings");
  await expect(page.getByRole("status")).toHaveText("Synced");
}

const openContexts: BrowserContext[] = [];
const createdEmails: string[] = [];

export type Device = {
  email: string;
  userId: string;
  context: BrowserContext;
  page: Page;
};

/** One signed-in "device" with a fresh account. */
export async function oneDevice(browser: Browser): Promise<Device> {
  const email = uniqueEmail();
  createdEmails.push(email);
  const context = await browser.newContext();
  openContexts.push(context);
  const page = await context.newPage();
  await login(page, email);
  return { email, userId: await userIdOf(email), context, page };
}

/** Two "devices" on one account. B starts from A's cookies, like a second browser that already logged in. */
export async function twoDevices(browser: Browser): Promise<{ a: Device; b: Device; userId: string }> {
  const a = await oneDevice(browser);
  const context = await browser.newContext({ storageState: await a.context.storageState() });
  openContexts.push(context);
  const page = await context.newPage();
  await openSettings(page);
  return { a, b: { ...a, context, page }, userId: a.userId };
}

/** Closes every browser context and deletes every account the test created. */
export async function cleanup() {
  for (const context of openContexts.splice(0)) await context.close();
  for (const email of createdEmails.splice(0)) await deleteUser(email);
}

export async function openSettings(page: Page) {
  await page.goto("/en/settings");
  await expect(page.getByRole("status")).toHaveText("Synced");
}

/** Loads the timer and waits for the first pull, which replaces the stored state with the server's. */
export async function openTimer(page: Page, reload = false) {
  const pulled = page.waitForResponse((response) => response.url().includes("/api/sync/state"));
  if (reload) await page.reload();
  else await page.goto("/en");
  await pulled;
  await expect(page.getByRole("button", { name: /^(Start|Pause)$/ })).toBeVisible();
}

/** Sets the focus length straight on the server, the way another device would. */
export async function setFocusMinutes(page: Page, focusMin: number) {
  const response = await page.request.put("/api/settings", {
    data: { clientUpdatedAt: new Date().toISOString(), focusMin },
  });
  expect(response.ok()).toBe(true);
}

export type RingView = {
  seconds: number;
  subtitle: string;
  running: boolean;
};

function parseClock(label: string): { seconds: number; subtitle: string } {
  const match = label.match(/^(?:(\d+):)?(\d+):(\d{2})\s+(.*)$/);
  if (!match) throw new Error(`Unexpected timer label: ${label}`);
  const [, hours, minutes, seconds, subtitle] = match;
  return {
    seconds: Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds),
    subtitle: subtitle ?? "",
  };
}

export async function readRing(page: Page): Promise<RingView> {
  const label = (await page.getByRole("timer").getAttribute("aria-label")) ?? "";
  const running = await page.getByRole("button", { name: "Pause", exact: true }).isVisible();
  return { ...parseClock(label), running };
}

/** Both devices show the same phase, status and time (within one second). */
export async function expectSameRing(a: Page, b: Page) {
  await expect
    .poll(async () => {
      const [left, right] = await Promise.all([readRing(a), readRing(b)]);
      return (
        left.subtitle === right.subtitle &&
        left.running === right.running &&
        Math.abs(left.seconds - right.seconds) <= 1
      );
    })
    .toBe(true);
}

/** Clicks a timer control and waits until the server has answered that command. */
export async function clickAndSync(page: Page, name: string) {
  const answered = page.waitForResponse(
    (response) => response.url().endsWith("/api/timer") && response.request().method() === "POST",
    { timeout: 15_000 },
  );
  await page.getByRole("button", { name, exact: true }).click();
  const response = await answered;
  expect(response.status()).toBe(200);
}

/** idb-keyval's default database, where the sync queue lives. */
export async function idbKeys(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open("keyval-store");
        open.onupgradeneeded = () => open.result.createObjectStore("keyval");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction("keyval", "readonly").objectStore("keyval").getAllKeys();
          request.onsuccess = () => {
            resolve(request.result.map(String));
            db.close();
          };
          request.onerror = () => reject(request.error);
        };
      }),
  );
}

/** Block only the sync endpoints, so the page and the session cookie still load. */
export const SYNC_ROUTES = /\/api\/(sync\/state|timer|sessions|settings|import)(\?|$)/;
