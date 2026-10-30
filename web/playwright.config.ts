import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Every test waits on real server time (a one-minute focus, the 15s poll),
  // and all of them share the OTP limit for the "local" IP. One at a time keeps
  // the timings honest.
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    locale: "en-US",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `next dev --port ${PORT}`,
    url: `${baseURL}/en`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      E2E_OTP: "1",
      // Better Auth rejects requests whose origin is not its base URL.
      BETTER_AUTH_URL: baseURL,
      NEXT_DIST_DIR: ".next/e2e",
    },
  },
});
