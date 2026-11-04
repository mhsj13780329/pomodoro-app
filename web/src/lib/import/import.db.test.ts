// Runs against the real test database (npm run test:db).
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ImportBody } from "./contract";

// The writers are server-only modules; vitest is not a Server Component, so neutralise the guard.
vi.mock("server-only", () => ({}));

type Prisma = typeof import("@/lib/prisma").prisma;
type ImportGuest = typeof import("./import").importGuest;
type ParseBody = (raw: unknown) => ImportBody;

let prisma: Prisma;
let importGuest: ImportGuest;
let parse: ParseBody;

beforeAll(async () => {
  // env.ts validates these at import, so they are set before the dynamic import.
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-1234");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  ({ prisma } = await import("@/lib/prisma"));
  ({ importGuest } = await import("./import"));
  const { importBodySchema } = await import("./contract");
  parse = (raw) => importBodySchema.parse(raw);
});

const userIds: string[] = [];

afterEach(async () => {
  await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } }); // rows cascade
});

afterAll(async () => {
  await prisma.$disconnect();
  vi.unstubAllEnvs();
});

const NOW = Date.parse("2026-10-30T12:00:00Z");

async function makeUser(data: { proLifetime?: boolean } = {}) {
  const id = `import-test-${randomUUID()}`;
  userIds.push(id);
  return prisma.user.create({ data: { id, name: "Tester", email: `${id}@example.com`, ...data } });
}

const guestSettings = {
  focusMin: 40,
  shortBreakMin: 7,
  longBreakMin: 20,
  longBreakEvery: 3,
  autoStartFocus: true,
  autoStartShortBreak: false,
  autoStartLongBreak: false,
  themeId: "night",
};

function task(order: number, patch: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    title: `task ${order}`,
    done: false,
    doneAt: null,
    order,
    createdAt: "2026-10-30T10:00:00.000Z",
    updatedAt: "2026-10-30T10:00:00.000Z",
    ...patch,
  };
}

function session(patch: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    phase: "focus",
    startedAt: "2026-10-30T10:00:00.000Z",
    endedAt: "2026-10-30T10:25:00.000Z",
    durationSec: 1500,
    plannedSec: 1500,
    completed: true,
    ...patch,
  };
}

function body(parts: { settings?: object; sessions?: object[]; tasks?: object[] } = {}) {
  return parse({ settings: guestSettings, sessions: [], tasks: [], ...parts });
}

describe("importGuest", () => {
  it("copies settings only when the account has none", async () => {
    const fresh = await makeUser();
    const first = await importGuest(fresh.id, body(), NOW);
    expect(first.importedSettings).toBe(true);
    expect((await prisma.settings.findUnique({ where: { userId: fresh.id } }))?.focusMin).toBe(40);

    const second = await importGuest(fresh.id, body({ settings: { ...guestSettings, focusMin: 55 } }), NOW);
    expect(second.importedSettings).toBe(false);
    expect((await prisma.settings.findUnique({ where: { userId: fresh.id } }))?.focusMin).toBe(40);

    const owner = await makeUser();
    await prisma.settings.create({ data: { userId: owner.id, ...guestSettings, focusMin: 30 } });
    const kept = await importGuest(owner.id, body(), NOW);
    expect(kept.importedSettings).toBe(false);
    expect((await prisma.settings.findUnique({ where: { userId: owner.id } }))?.focusMin).toBe(30);
  });

  it("inserts nothing new when run twice", async () => {
    const user = await makeUser();
    const t = task(0);
    const input = body({ tasks: [t], sessions: [session({ taskId: t.id })] });
    const first = await importGuest(user.id, input, NOW);
    expect(first).toMatchObject({ importedTasks: 1, importedSessions: 1, importedSettings: true });
    const second = await importGuest(user.id, input, NOW);
    expect(second).toMatchObject({ importedTasks: 0, importedSessions: 0, importedSettings: false, skippedTasks: 0 });
    expect(await prisma.task.count({ where: { userId: user.id } })).toBe(1);
    expect(await prisma.focusSession.count({ where: { userId: user.id } })).toBe(1);
  });

  it("gives a free account done tasks plus as many active ones as fit", async () => {
    const user = await makeUser();
    for (let i = 0; i < 8; i++) await prisma.task.create({ data: { userId: user.id, title: `own ${i}`, order: i } });
    const active = [task(0), task(1), task(2), task(3)];
    const finished = task(4, { done: true, doneAt: "2026-10-30T11:00:00.000Z" });
    const result = await importGuest(user.id, body({ tasks: [...active, finished] }), NOW);
    expect(result).toMatchObject({ importedTasks: 3, skippedTasks: 2 });
    expect(await prisma.task.count({ where: { userId: user.id, done: false } })).toBe(10);
    expect(await prisma.task.findUnique({ where: { id: finished.id } })).not.toBeNull();
  });

  it("gives a Pro account every task", async () => {
    const user = await makeUser({ proLifetime: true });
    const tasks = Array.from({ length: 15 }, (_, i) => task(i));
    const result = await importGuest(user.id, body({ tasks }), NOW);
    expect(result).toMatchObject({ importedTasks: 15, skippedTasks: 0 });
  });

  it("skips a task id owned by another user", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const t = task(0, { title: "mine" });
    await prisma.task.create({ data: { id: t.id, userId: owner.id, title: "mine", order: 0 } });
    const result = await importGuest(other.id, body({ tasks: [t] }), NOW);
    expect(result.importedTasks).toBe(0);
    expect((await prisma.task.findUnique({ where: { id: t.id } }))?.userId).toBe(owner.id);
  });

  it("keeps the task on a session for an imported task and nulls an unknown one", async () => {
    const user = await makeUser();
    const t = task(0);
    const known = session({ taskId: t.id });
    const unknown = session({ taskId: randomUUID() });
    const result = await importGuest(user.id, body({ tasks: [t], sessions: [known, unknown] }), NOW);
    expect(result.importedSessions).toBe(2);
    expect((await prisma.focusSession.findUnique({ where: { id: known.id } }))?.taskId).toBe(t.id);
    expect((await prisma.focusSession.findUnique({ where: { id: unknown.id } }))?.taskId).toBeNull();
  });

  it("rejects a session that starts in the future", async () => {
    const user = await makeUser();
    const future = session({ startedAt: "2026-10-30T14:00:00.000Z", endedAt: "2026-10-30T14:25:00.000Z" });
    const result = await importGuest(user.id, body({ sessions: [future] }), NOW);
    expect(result.importedSessions).toBe(0);
    expect(await prisma.focusSession.count({ where: { userId: user.id } })).toBe(0);
  });

  it("accepts the legacy FOCUS body without plannedSec", async () => {
    const user = await makeUser();
    const legacy: Partial<ReturnType<typeof session>> & { id: string } = session({ phase: "FOCUS" });
    delete legacy.plannedSec;
    const result = await importGuest(user.id, body({ sessions: [legacy] }), NOW);
    expect(result.importedSessions).toBe(1);
    const row = await prisma.focusSession.findUnique({ where: { id: legacy.id } });
    expect(row?.phase).toBe("FOCUS");
  });

  it("does not overwrite a session id owned by another user", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const s = session();
    await importGuest(owner.id, body({ sessions: [s] }), NOW);
    const result = await importGuest(other.id, body({ sessions: [{ ...s, durationSec: 60 }] }), NOW);
    expect(result.importedSessions).toBe(0);
    const row = await prisma.focusSession.findUnique({ where: { id: s.id } });
    expect(row?.userId).toBe(owner.id);
    expect(row?.durationSec).toBe(1500);
  });
});
