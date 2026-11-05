// Runs against the real test database (npm run test:db).
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NoteWire } from "./contract";

vi.mock("server-only", () => ({}));

type Prisma = typeof import("@/lib/prisma").prisma;
type Rows = typeof import("./rows");

let prisma: Prisma;
let rows: Rows;

beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-1234");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  ({ prisma } = await import("@/lib/prisma"));
  rows = await import("./rows");
});

const userIds: string[] = [];

afterEach(async () => {
  await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } }); // notes cascade
});

afterAll(async () => {
  await prisma.$disconnect();
  vi.unstubAllEnvs();
});

const NOW = Date.now();
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

async function makeUser(data: { proLifetime?: boolean; proUntil?: Date } = {}) {
  const id = `notes-test-${randomUUID()}`;
  userIds.push(id);
  return prisma.user.create({ data: { id, name: "Tester", email: `${id}@example.com`, ...data } });
}

function note(patch: Partial<NoteWire> = {}): NoteWire {
  return { id: randomUUID(), title: "Title", body: "Body", createdAt: at(0), updatedAt: at(0), deletedAt: null, ...patch };
}

const push = (userId: string, ...notes: NoteWire[]) => rows.applyNoteBatch(userId, { notes }, Date.now());

describe("notes server rules", () => {
  it("rejects a free account creating a note", async () => {
    const user = await makeUser();
    const n = note();
    const res = await push(user.id, n);
    expect(res.results).toEqual([{ id: n.id, status: "pro_required" }]);
    expect(res.pro).toBe(false);
    expect(await prisma.note.count({ where: { userId: user.id } })).toBe(0);
  });

  it("lets a Pro account create and edit", async () => {
    const user = await makeUser({ proLifetime: true });
    const n = note();
    expect((await push(user.id, n)).results[0].status).toBe("ok");
    const edited = { ...n, body: "New", updatedAt: at(5) };
    expect((await push(user.id, edited)).results[0].status).toBe("ok");
    expect((await prisma.note.findUniqueOrThrow({ where: { id: n.id } })).body).toBe("New");
  });

  it("lets an expired Pro read and delete but not edit", async () => {
    const user = await makeUser({ proUntil: new Date(Date.now() + 60_000) });
    const n = note();
    await push(user.id, n);
    await prisma.user.update({ where: { id: user.id }, data: { proUntil: new Date(Date.now() - 1000) } });

    const pull = await rows.readNotes(user.id, 0, Date.now());
    expect(pull.pro).toBe(false);
    expect(pull.notes.map((x) => x.id)).toEqual([n.id]);

    const edit = await push(user.id, { ...n, body: "Nope", updatedAt: at(5) });
    expect(edit.results[0].status).toBe("pro_required");
    expect(edit.rows[0].body).toBe("Body");

    const del = await push(user.id, { ...n, body: "Sneaky", updatedAt: at(6), deletedAt: at(6) });
    expect(del.results[0].status).toBe("ok");
    const stored = await prisma.note.findUniqueOrThrow({ where: { id: n.id } });
    expect(stored.deletedAt).not.toBeNull();
    expect(stored.body).toBe("Body");
  });

  it("ignores a stale write (last write wins)", async () => {
    const user = await makeUser({ proLifetime: true });
    const n = note({ updatedAt: at(10), body: "newer" });
    await push(user.id, n);
    const res = await push(user.id, { ...n, body: "older", updatedAt: at(5) });
    expect(res.results[0].status).toBe("stale");
    expect(res.rows[0].body).toBe("newer");
    expect((await push(user.id, n)).results[0].status).toBe("stale"); // equal stamp: a retry
  });

  it("keeps a deleted note deleted", async () => {
    const user = await makeUser({ proLifetime: true });
    const n = note();
    await push(user.id, n);
    await push(user.id, { ...n, updatedAt: at(5), deletedAt: at(5) });
    const res = await push(user.id, { ...n, body: "back", updatedAt: at(9) });
    expect(res.results[0].status).toBe("stale");
    expect(res.rows[0].deletedAt).not.toBeNull();
    expect((await prisma.note.findUniqueOrThrow({ where: { id: n.id } })).deletedAt).not.toBeNull();
  });

  it("does not touch another user's note", async () => {
    const owner = await makeUser({ proLifetime: true });
    const other = await makeUser({ proLifetime: true });
    const n = note();
    await push(owner.id, n);
    const res = await push(other.id, { ...n, body: "mine now", updatedAt: at(5) });
    expect(res.results[0].status).toBe("stale");
    expect(res.rows).toEqual([]);
    expect((await prisma.note.findUniqueOrThrow({ where: { id: n.id } })).body).toBe("Body");
  });

  it("pulls by cursor, with deletes in a delta and not in a full pull", async () => {
    const user = await makeUser({ proLifetime: true });
    const a = note();
    const b = note();
    await push(user.id, a, b);

    const full = await rows.readNotes(user.id, 0, Date.now());
    expect(full.full).toBe(true);
    expect(full.notes.map((x) => x.id).sort()).toEqual([a.id, b.id].sort());

    const since = Date.now() + 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    await push(user.id, { ...a, updatedAt: at(5), deletedAt: at(5) });

    const delta = await rows.readNotes(user.id, since, Date.now());
    expect(delta.full).toBe(false);
    expect(delta.notes.map((x) => x.id)).toEqual([a.id]);
    expect(delta.notes[0].deletedAt).not.toBeNull();

    const again = await rows.readNotes(user.id, 0, Date.now());
    expect(again.notes.map((x) => x.id)).toEqual([b.id]);
  });
});
