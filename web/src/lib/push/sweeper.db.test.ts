// Runs against the real test database (npm run test:db).
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const sendToUser = vi.fn(async () => {});
vi.mock("./send", () => ({ sendToUser, pushEnabled: () => true }));

type Prisma = typeof import("@/lib/prisma").prisma;
let prisma: Prisma;
let sweepOnce: typeof import("./sweeper").sweepOnce;

beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-1234");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  ({ prisma } = await import("@/lib/prisma"));
  ({ sweepOnce } = await import("./sweeper"));
});

const userIds: string[] = [];

afterEach(async () => {
  sendToUser.mockClear();
  await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
});

afterAll(async () => {
  await prisma.$disconnect();
  vi.unstubAllEnvs();
});

const NOW = Date.now();

async function runningUser(opts: { subscribed: boolean; endedAgoSec: number }) {
  const id = `push-test-${randomUUID()}`;
  userIds.push(id);
  await prisma.user.create({ data: { id, name: "T", email: `${id}@example.com`, locale: "en" } });
  await prisma.settings.create({
    data: {
      userId: id, focusMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4,
      autoStartFocus: false, autoStartShortBreak: true, autoStartLongBreak: false, themeId: "default",
    },
  });
  await prisma.activeTimer.create({
    data: {
      userId: id, phase: "FOCUS", status: "RUNNING", plannedSec: 1500, cycleIndex: 0, version: 3,
      runId: randomUUID(), startedAt: new Date(NOW - (1500 + opts.endedAgoSec) * 1000),
    },
  });
  if (opts.subscribed) {
    await prisma.pushSubscription.create({
      data: { userId: id, endpoint: `https://push.example/${id}`, p256dh: "k", auth: "a" },
    });
  }
  return id;
}

describe("sweepOnce", () => {
  it("completes a due phase for a subscribed user and pushes once", async () => {
    const id = await runningUser({ subscribed: true, endedAgoSec: 2 });
    expect(await sweepOnce(NOW)).toBe(1);
    expect(sendToUser).toHaveBeenCalledTimes(1);
    expect(sendToUser).toHaveBeenCalledWith(id, expect.objectContaining({ title: "Short break", body: expect.any(String) }));
    const timer = await prisma.activeTimer.findUnique({ where: { userId: id } });
    expect(timer?.phase).toBe("SHORT_BREAK");
    expect(timer?.version).toBe(4);
    expect(await sweepOnce(NOW)).toBe(0); // the new phase is not due: no second push
  });

  it("leaves users without a subscription and phases not yet over alone", async () => {
    const plain = await runningUser({ subscribed: false, endedAgoSec: 2 });
    await runningUser({ subscribed: true, endedAgoSec: -60 });
    expect(await sweepOnce(NOW)).toBe(0);
    expect(sendToUser).not.toHaveBeenCalled();
    expect((await prisma.activeTimer.findUnique({ where: { userId: plain } }))?.version).toBe(3);
  });

  it("completes but does not push when notifications are off", async () => {
    const id = await runningUser({ subscribed: true, endedAgoSec: 2 });
    await prisma.settings.update({ where: { userId: id }, data: { notificationsOn: false } });
    await sweepOnce(NOW);
    expect(sendToUser).not.toHaveBeenCalled();
    expect((await prisma.activeTimer.findUnique({ where: { userId: id } }))?.version).toBe(4);
  });
});
