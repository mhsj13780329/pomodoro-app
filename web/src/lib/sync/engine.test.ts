import { afterEach, describe, expect, it } from "vitest";
import type { ProjectWire, TaskWire } from "@/lib/tasks/contract";
import { createSyncEngine, type SyncEngine } from "./create-engine";
import type { QueuedCommand, SessionInput } from "./contract";
import { FakeEnv, FakeHost, FakeServer, createMemoryStorage } from "./fakes";
import type { QueuedAction } from "./ports";
import { syncView } from "./status";

const USER = "user-1";
const TASK_A = "11111111-1111-4111-8111-111111111111";

type Harness = ReturnType<typeof setup>;
const stops: (() => void)[] = [];
afterEach(() => {
  while (stops.length) stops.pop()?.();
});

function setup(options: { online?: boolean } = {}) {
  const env = new FakeEnv();
  env.online = options.online ?? true;
  const server = new FakeServer(env);
  const storage = createMemoryStorage();
  const host = new FakeHost();
  const engine: SyncEngine = createSyncEngine({ env, transport: server, storage, host });
  return {
    env,
    server,
    storage,
    host,
    engine,
    start() {
      const stop = engine.start(USER);
      stops.push(stop);
      return stop;
    },
  };
}

/** Everything the fakes do resolves in microtasks, so one macrotask lets the engine finish. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const action = (id: string, command: QueuedCommand, sessionId: string | null = null): QueuedAction => ({
  id,
  command,
  sessionId,
});

const session = (id: string, taskId: string | null = null): SessionInput => ({
  id,
  phase: "focus",
  startedAt: "2026-01-01T10:00:00.000Z",
  endedAt: "2026-01-01T10:25:00.000Z",
  durationSec: 1500,
  plannedSec: 1500,
  completed: true,
  taskId,
});

const task = (id: string): TaskWire => ({
  id,
  title: "Write",
  notes: null,
  estimatePomodoros: null,
  done: false,
  doneAt: null,
  order: 0,
  projectId: null,
  parentId: null,
  tagIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
});

const project = (id: string): ProjectWire => ({
  id,
  name: "P",
  color: "focus",
  archived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
});

async function seedQueue(h: Harness, actions: QueuedAction[], sessions: SessionInput[] = []) {
  await h.storage.writeActions(USER, actions);
  await h.storage.writeSessions(USER, sessions);
}

async function queued(h: Harness) {
  return {
    actions: await h.storage.readActions(USER),
    sessions: await h.storage.readSessions(USER),
    rows: await h.storage.readTaskQueue(USER),
  };
}

const pause = (expectedVersion: number): QueuedCommand => ({ action: "pause", expectedVersion });
const resume = (expectedVersion: number): QueuedCommand => ({ action: "resume", expectedVersion });
const setTask: QueuedCommand = { action: "setTask", taskId: TASK_A };
const complete = (expectedVersion: number): QueuedCommand => ({ action: "complete", expectedVersion });

const networkDown = { ok: false as const, network: true, status: 0 };
const rejected = { ok: false as const, network: false, status: 400 };

describe("replay", () => {
  it("uploads task rows first, then timer actions in order, then sessions", async () => {
    const h = setup();
    await h.storage.writeTaskQueue(USER, { projects: { p: project("p") }, tags: {}, tasks: { [TASK_A]: task(TASK_A) } });
    await seedQueue(h, [action("1", pause(1)), action("2", resume(2)), action("3", setTask)], [session("s1")]);
    h.start();
    await settle();

    expect(h.server.calls).toEqual(["tasks", "timer:pause", "timer:resume", "timer:setTask", "sessions:s1"]);
    expect(h.server.appliedBatches[0]?.tasks.map((row) => row.id)).toEqual([TASK_A]);
    expect(h.host.settled).toHaveLength(1);
    expect(await queued(h)).toEqual({ actions: [], sessions: [], rows: { projects: {}, tags: {}, tasks: {} } });
    expect(syncView()).toEqual({ kind: "synced" });
  });

  it("adopts the server state once, after the last action, with kind ok", async () => {
    const h = setup();
    await seedQueue(h, [action("1", pause(1)), action("2", resume(2))]);
    h.start();
    await settle();
    expect(h.host.kinds()).toEqual(["ok"]);
    expect(h.host.adopted[0]?.state.activeTimer.version).toBe(3);
  });

  it("on a 409 drops non-setTask actions and their sessions, keeps setTask, and adopts the server state", async () => {
    const h = setup();
    h.server.version = 5;
    await seedQueue(
      h,
      [action("1", complete(1), "s1"), action("2", pause(2)), action("3", resume(3), "s2"), action("4", setTask)],
      [session("s1"), session("s2"), session("s3")],
    );
    h.start();
    await settle();

    // The stale complete was refused; the others were never sent; the pick was.
    expect(h.server.calls).toEqual(["timer:complete", "timer:setTask", "sessions:s3"]);
    expect(h.host.kinds()).toEqual(["conflict", "ok"]);
    expect(h.host.adopted[0]?.options.keepTask).toBe(true);
    expect(h.host.adopted[0]?.state.activeTimer.version).toBe(5);
    expect(h.server.taskId).toBe(TASK_A);
    const left = await queued(h);
    expect(left.actions).toEqual([]);
    expect(left.sessions).toEqual([]);
    expect([...h.server.sessions]).toEqual(["s3"]);
  });

  it("on a 409 with no setTask queued, adopts and stops replaying", async () => {
    const h = setup();
    h.server.version = 5;
    await seedQueue(h, [action("1", pause(1)), action("2", resume(2))]);
    h.start();
    await settle();
    expect(h.server.calls).toEqual(["timer:pause"]);
    expect(h.host.adopted).toHaveLength(1);
    expect(h.host.adopted[0]?.options).toEqual({ timer: true, kind: "conflict", keepTask: false });
    expect((await queued(h)).actions).toEqual([]);
  });

  it("on a 422 adopts with kind early and forces the clock sample", async () => {
    const h = setup();
    h.server.clockSkewMs = 4_000;
    h.server.timerHooks.push(() => ({ ...h.server.respond(422), sentAt: 0, receivedAt: h.env.now() }));
    await seedQueue(h, [action("1", complete(1), "s1")], [session("s1")]);
    h.start();
    await settle();
    expect(h.host.kinds()).toEqual(["early"]);
    expect((await queued(h)).sessions).toEqual([]);
    // A slow round trip is normally ignored, but a 422 is always sampled.
    expect(h.engine.now()).toBe(h.env.now() + 4_000);
  });

  it("drops an action the server rejects (not a network error) and carries on", async () => {
    const h = setup();
    h.server.timerHooks.push(() => rejected);
    await seedQueue(h, [action("1", pause(1), "s1"), action("2", pause(1))], [session("s1")]);
    h.start();
    await settle();
    expect(h.server.calls.filter((call) => call.startsWith("timer:"))).toEqual(["timer:pause", "timer:pause"]);
    expect(h.server.appliedTimer).toEqual([pause(1)]);
    expect((await queued(h)).actions).toEqual([]);
    expect(h.host.kinds()).toEqual(["ok"]);
  });

  it("on a network error keeps the queue, shows offline, and schedules a retry", async () => {
    const h = setup();
    h.server.timerHooks.push(() => networkDown);
    await seedQueue(h, [action("1", pause(1)), action("2", resume(2))], [session("s1")]);
    h.start();
    await settle();

    expect((await queued(h)).actions.map((item) => item.id)).toEqual(["1", "2"]);
    expect(syncView()).toEqual({ kind: "offline", waiting: 3 });
    expect(h.env.pendingTimeouts()).toContain(2_000);
    expect(h.server.calls).not.toContain("sessions:s1");

    h.env.fireTimeouts();
    await settle();
    expect((await queued(h)).actions).toEqual([]);
    expect(h.server.appliedTimer).toEqual([pause(1), resume(2)]);
    expect(syncView()).toEqual({ kind: "synced" });
  });

  it("on a network error in the task upload keeps the rows, skips timer actions, and retries", async () => {
    const h = setup();
    h.server.failTaskBatch = { network: true, status: 0 };
    await h.storage.writeTaskQueue(USER, { projects: {}, tags: {}, tasks: { [TASK_A]: task(TASK_A) } });
    await seedQueue(h, [action("1", pause(1))]);
    h.start();
    await settle();
    expect(h.server.calls).toEqual(["tasks"]);
    expect(h.env.pendingTimeouts()).toContain(2_000);
    h.server.failTaskBatch = null;
    h.env.fireTimeouts();
    await settle();
    expect(h.server.calls).toEqual(["tasks", "tasks", "timer:pause"]);
    expect((await queued(h)).rows.tasks).toEqual({});
  });

  it("keeps a task row that was edited again while its upload was in flight", async () => {
    const h = setup();
    const original = task(TASK_A);
    await h.storage.writeTaskQueue(USER, { projects: {}, tags: {}, tasks: { [TASK_A]: original } });
    const post = h.server.postTaskBatch;
    h.server.postTaskBatch = async (batch) => {
      const result = await post(batch);
      await h.storage.writeTaskQueue(USER, {
        projects: {},
        tags: {},
        tasks: { [TASK_A]: { ...original, title: "Edited", updatedAt: "2026-01-02T00:00:00.000Z" } },
      });
      return result;
    };
    h.start();
    await settle();
    // The second round sent the edit, and then the queue was empty.
    expect(h.server.appliedBatches.map((batch) => batch.tasks[0]?.title)).toEqual(["Write", "Edited"]);
  });
});

describe("offline", () => {
  it("does nothing: no calls, the queue stays, the status says how many wait", async () => {
    const h = setup({ online: false });
    await seedQueue(h, [action("1", pause(1)), action("2", complete(2), "s1")], [session("s1")]);
    h.start();
    await settle();
    h.engine.publishTimer({ command: pause(9), session: null });
    await settle();

    expect(h.server.calls).toEqual([]);
    expect((await queued(h)).actions).toHaveLength(3);
    expect(h.host.adopted).toEqual([]);
    // pause + pause(9) + the session; the queued complete counts through its session.
    expect(syncView()).toEqual({ kind: "offline", waiting: 3 });
  });

  it("replays when the browser comes back online", async () => {
    const h = setup({ online: false });
    await seedQueue(h, [action("1", pause(1))]);
    h.start();
    await settle();
    expect(h.server.calls).toEqual([]);
    h.env.online = true;
    h.env.emit("online");
    await settle();
    expect(h.server.calls).toEqual(["timer:pause"]);
    expect(syncView()).toEqual({ kind: "synced" });
  });

  it("shows offline with the waiting count when the browser goes offline", async () => {
    const h = setup();
    h.start();
    await settle();
    await seedQueue(h, [action("1", pause(1))]);
    h.env.online = false;
    h.env.emit("offline");
    await settle();
    expect(syncView()).toEqual({ kind: "offline", waiting: 1 });
  });
});

describe("publishing", () => {
  it("queues the command with its session, then replays it", async () => {
    const h = setup();
    h.start();
    await settle();
    h.engine.publishTimer({ command: complete(1), session: session("s1", TASK_A) });
    await settle();
    expect(h.server.calls).toEqual(["fetch", "timer:complete", "sessions:s1"]);
    expect(h.server.appliedTimer).toEqual([complete(1)]);
    expect(h.host.kinds()).toEqual(["pull", "ok"]);
  });

  it("queues task rows and uploads them", async () => {
    const h = setup();
    h.start();
    await settle();
    h.engine.publishTasks({ tasks: [task(TASK_A)] });
    await settle();
    expect(h.server.calls).toEqual(["fetch", "tasks"]);
    expect((await queued(h)).rows.tasks).toEqual({});
  });

  it("does nothing after stop", async () => {
    const h = setup();
    const stop = h.start();
    await settle();
    stop();
    h.engine.publishTimer({ command: pause(1), session: null });
    h.engine.publishTasks({ tasks: [task(TASK_A)] });
    await settle();
    expect(h.server.calls).toEqual(["fetch"]);
    expect(h.engine.isActive()).toBe(false);
    expect(syncView()).toEqual({ kind: "guest" });
  });
});

describe("pull", () => {
  it("adopts the server state, its tasks and its theme", async () => {
    const h = setup();
    h.server.themeId = "night";
    h.server.counts = { [TASK_A]: 2 };
    h.start();
    await settle();
    expect(h.host.kinds()).toEqual(["pull"]);
    expect(h.host.themes).toEqual(["night"]);
    expect(h.host.counts).toEqual({ [TASK_A]: 2 });
    expect(syncView()).toEqual({ kind: "synced" });
  });

  it("lets a local publish during an in-flight pull win (epoch guard)", async () => {
    const h = setup();
    let release = () => {};
    h.server.fetchGate = new Promise<void>((resolve) => (release = resolve));
    h.start();
    await settle();
    expect(h.server.calls).toEqual(["fetch"]);

    h.engine.publishTimer({ command: pause(1), session: null });
    release();
    await settle();

    // The stale pull was thrown away: nothing of it reached the app, then the pause went up.
    expect(h.host.kinds()).toEqual(["ok"]);
    expect(h.host.themes).toEqual([]);
    expect(h.server.calls).toEqual(["fetch", "timer:pause"]);
  });

  it("also yields to local task edits made during the pull", async () => {
    const h = setup();
    let release = () => {};
    h.server.fetchGate = new Promise<void>((resolve) => (release = resolve));
    h.start();
    await settle();
    h.engine.publishTasks({ tasks: [task(TASK_A)] });
    release();
    await settle();
    expect(h.host.kinds()).toEqual([]);
    expect(h.server.calls).toEqual(["fetch", "tasks"]);
  });

  it("with only sessions queued, fetches, adopts, then uploads the sessions", async () => {
    const h = setup();
    await seedQueue(h, [], [session("s1", TASK_A)]);
    h.start();
    await settle();
    expect(h.server.calls).toEqual(["fetch", "sessions:s1"]);
    expect(h.host.kinds()).toEqual(["pull"]);
    expect((await queued(h)).sessions).toEqual([]);
    expect(h.host.waitingSessions).toEqual([]);
    // The server had no count for it at pull time, and it was accepted afterwards: counted once.
    expect(h.host.counts).toEqual({ [TASK_A]: 1 });
  });

  // BUG (not fixed here, planned separately): flushSessions tells the tasks store about sessions the
  // server answered "existing" for, and the store adds them on top of the counts adoptBlock just
  // took from the server. A session the server already stores (finished focus sent with the timer's
  // complete) is therefore counted twice until the next pull. FakeHost mirrors the store's rule.
  it.fails("does not double-count a queued session the server already has", async () => {
    const h = setup();
    h.server.sessions.add("s1");
    h.server.counts = { [TASK_A]: 1 };
    await seedQueue(h, [], [session("s1", TASK_A)]);
    h.start();
    await settle();
    expect(h.host.counts).toEqual({ [TASK_A]: 1 });
  });

  it("pushes newer local settings instead of adopting the server's", async () => {
    const h = setup();
    h.host.settings = { ...h.host.settings, settingsUpdatedAt: Date.parse("2026-01-01T00:00:00.000Z"), themeId: "forest" };
    h.start();
    await settle();
    expect(h.server.calls).toEqual(["fetch", "settings"]);
    expect(h.server.themeId).toBe("forest");
    expect(h.host.kinds()).toEqual(["ok"]);
    expect(h.host.themes).toEqual(["forest"]);
  });

  it("debounces a settings change before pushing it", async () => {
    const h = setup();
    h.start();
    await settle();
    h.host.settings = { ...h.host.settings, settingsUpdatedAt: h.env.now() };
    h.engine.settingsChanged();
    h.engine.settingsChanged();
    expect(h.env.pendingTimeouts()).toEqual([800]);
    h.env.fireTimeouts();
    await settle();
    expect(h.server.calls).toEqual(["fetch", "settings"]);
  });

  it("samples the server clock", async () => {
    const h = setup();
    h.server.clockSkewMs = 7_000;
    expect(h.engine.now()).toBe(h.env.now());
    h.start();
    await settle();
    expect(h.engine.now()).toBe(h.env.now() + 7_000);
  });
});

describe("refresh triggers", () => {
  it("polls every 15s while visible and not while hidden", async () => {
    const h = setup();
    h.start();
    await settle();
    expect(h.env.pendingIntervals()).toEqual([15_000]);

    h.env.fireIntervals();
    await settle();
    expect(h.server.calls).toEqual(["fetch", "fetch"]);

    h.env.visible = false;
    h.env.emit("visibility");
    expect(h.env.pendingIntervals()).toEqual([]);
    h.env.emit("visibility");
    await settle();
    expect(h.server.calls).toEqual(["fetch", "fetch"]);

    h.env.visible = true;
    h.env.emit("visibility");
    await settle();
    expect(h.server.calls).toEqual(["fetch", "fetch", "fetch"]);
    expect(h.env.pendingIntervals()).toEqual([15_000]);
  });

  it("does not poll when it starts hidden, and pulls on focus", async () => {
    const h = setup();
    h.env.visible = false;
    h.start();
    await settle();
    expect(h.env.pendingIntervals()).toEqual([]);
    h.env.emit("focus");
    await settle();
    expect(h.server.calls).toEqual(["fetch", "fetch"]);
  });

  it("stops listening and timing when stopped", async () => {
    const h = setup();
    const stop = h.start();
    await settle();
    stop();
    expect(h.env.listenerCount()).toBe(0);
    expect(h.env.pendingIntervals()).toEqual([]);
  });
});

describe("logout flush", () => {
  /** Starts offline so the initial pull leaves the seeded queue alone, then goes online. */
  async function offlineWith(actions: QueuedAction[], sessions: SessionInput[] = []) {
    const h = setup({ online: false });
    await seedQueue(h, actions, sessions);
    h.start();
    await settle();
    h.env.online = true;
    return h;
  }

  it("uploads everything and returns 0", async () => {
    const h = await offlineWith([action("1", pause(1)), action("2", setTask)], [session("s1")]);
    await h.storage.writeTaskQueue(USER, { projects: {}, tags: {}, tasks: { [TASK_A]: task(TASK_A) } });
    expect(await h.engine.flush({ reason: "logout" })).toBe(0);
    expect(h.server.calls).toEqual(["tasks", "timer:pause", "timer:setTask", "sessions:s1"]);
  });

  it("keeps setTask on a 409 and drops the sessions of the other actions, like any replay", async () => {
    const h = await offlineWith(
      [action("1", complete(1), "s1"), action("2", pause(2)), action("3", setTask)],
      [session("s1"), session("s2")],
    );
    h.server.version = 4;
    expect(await h.engine.flush({ reason: "logout" })).toBe(0);
    expect(h.server.calls).toEqual(["timer:complete", "timer:setTask", "sessions:s2"]);
    expect(h.server.taskId).toBe(TASK_A);
    expect(h.host.kinds()).toEqual(["conflict", "ok"]);
  });

  it("drops an action the server rejects and keeps going", async () => {
    const h = await offlineWith([action("1", pause(1)), action("2", resume(2))]);
    h.server.timerHooks.push(() => rejected);
    expect(await h.engine.flush({ reason: "logout" })).toBe(0);
    expect(h.server.calls).toEqual(["timer:pause", "timer:resume"]);
  });

  it("returns what is still waiting after a network error", async () => {
    const h = await offlineWith([action("1", pause(1)), action("2", complete(2), "s1")], [session("s1")]);
    h.server.timerHooks.push(() => networkDown);
    // The finished focus counts once (as a session); the pause counts once.
    expect(await h.engine.flush({ reason: "logout" })).toBe(2);
    expect((await queued(h)).actions).toHaveLength(2);
  });

  it("returns the count without calling the server when offline", async () => {
    const h = await offlineWith([action("1", pause(1)), action("2", setTask)], [session("s1")]);
    h.env.online = false;
    expect(await h.engine.flush({ reason: "logout" })).toBe(3);
    expect(h.server.calls).toEqual([]);
  });

  it("returns 0 when sync is not running", async () => {
    const h = setup();
    expect(await h.engine.flush({ reason: "logout" })).toBe(0);
  });
});

describe("wipe", () => {
  it("stops sync and deletes the queues", async () => {
    const h = setup({ online: false });
    await seedQueue(h, [action("1", pause(1))], [session("s1")]);
    h.start();
    await settle();
    await h.engine.wipe();
    expect(h.engine.isActive()).toBe(false);
    expect(await queued(h)).toEqual({ actions: [], sessions: [], rows: { projects: {}, tags: {}, tasks: {} } });
    expect(syncView()).toEqual({ kind: "guest" });
  });
});
