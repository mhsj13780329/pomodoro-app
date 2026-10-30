import { describe, expect, it } from "vitest";
import { FREE_ACTIVE_LIMIT } from "./contract";
import { gateProItemWrite, gateTaskWrite, isActiveTask, type GateTask } from "./gate";

const plain: GateTask = {
  done: false,
  deletedAt: null,
  parentId: null,
  projectId: null,
  estimatePomodoros: null,
  notes: null,
  tagIds: [],
};

const P1 = "11111111-1111-4111-8111-111111111111";
const T1 = "22222222-2222-4222-8222-222222222222";
const free = { pro: false };

describe("isActiveTask", () => {
  it("counts only top-level, not done, not deleted tasks", () => {
    expect(isActiveTask(plain)).toBe(true);
    expect(isActiveTask({ ...plain, done: true })).toBe(false);
    expect(isActiveTask({ ...plain, deletedAt: "2026-10-30T10:00:00Z" })).toBe(false);
    expect(isActiveTask({ ...plain, parentId: P1 })).toBe(false);
  });
});

describe("active task limit (free)", () => {
  it("allows the 10th active task and rejects the 11th", () => {
    expect(gateTaskWrite(null, plain, { ...free, activeCount: FREE_ACTIVE_LIMIT - 1 })).toEqual({ ok: true });
    expect(gateTaskWrite(null, plain, { ...free, activeCount: FREE_ACTIVE_LIMIT })).toEqual({
      ok: false,
      reason: "active_limit",
    });
  });

  it("does not count a task that is created already done", () => {
    expect(gateTaskWrite(null, { ...plain, done: true }, { ...free, activeCount: 10 })).toEqual({ ok: true });
  });

  it("rejects un-checking a done task when the list is full", () => {
    const stored = { ...plain, done: true };
    expect(gateTaskWrite(stored, plain, { ...free, activeCount: 10 })).toEqual({
      ok: false,
      reason: "active_limit",
    });
    expect(gateTaskWrite(stored, plain, { ...free, activeCount: 9 })).toEqual({ ok: true });
  });

  it("lets a user who is already over the limit finish, rename, reorder and delete", () => {
    const over = { ...free, activeCount: 14 };
    expect(gateTaskWrite(plain, { ...plain, done: true }, over)).toEqual({ ok: true });
    expect(gateTaskWrite(plain, plain, over)).toEqual({ ok: true });
    expect(gateTaskWrite(plain, { ...plain, deletedAt: "2026-10-30T10:00:00Z" }, over)).toEqual({ ok: true });
  });

  it("blocks new tasks for a user who is over the limit", () => {
    expect(gateTaskWrite(null, plain, { ...free, activeCount: 14 })).toEqual({ ok: false, reason: "active_limit" });
  });

  it("does not limit Pro", () => {
    expect(gateTaskWrite(null, plain, { pro: true, activeCount: 500 })).toEqual({ ok: true });
  });
});

describe("Pro-only fields (free)", () => {
  const ctx = { ...free, activeCount: 0 };

  it.each([
    ["project", { projectId: P1 }],
    ["parent task", { parentId: P1 }],
    ["estimate", { estimatePomodoros: 3 }],
    ["notes", { notes: "remember this" }],
    ["tag", { tagIds: [T1] }],
  ])("rejects a new task with a %s", (_name, patch) => {
    expect(gateTaskWrite(null, { ...plain, ...patch }, ctx)).toEqual({ ok: false, reason: "pro_required" });
  });

  it("rejects adding a Pro field to an existing task", () => {
    expect(gateTaskWrite(plain, { ...plain, estimatePomodoros: 2 }, ctx)).toEqual({
      ok: false,
      reason: "pro_required",
    });
  });

  it("allows everything for Pro", () => {
    const rich = { ...plain, projectId: P1, estimatePomodoros: 4, notes: "x", tagIds: [T1] };
    expect(gateTaskWrite(null, rich, { pro: true, activeCount: 0 })).toEqual({ ok: true });
  });

  it("keeps existing Pro data usable after Pro ends", () => {
    const stored = { ...plain, projectId: P1, estimatePomodoros: 4, notes: "keep", tagIds: [T1] };
    // Rename or check off: the Pro fields are unchanged.
    expect(gateTaskWrite(stored, { ...stored, done: true }, ctx)).toEqual({ ok: true });
    expect(gateTaskWrite(stored, { ...stored, deletedAt: "2026-10-30T10:00:00Z" }, ctx)).toEqual({ ok: true });
  });

  it("lets a lapsed user clear a Pro field but not change it", () => {
    const stored = { ...plain, projectId: P1, estimatePomodoros: 4, tagIds: [T1] };
    expect(gateTaskWrite(stored, { ...stored, projectId: null, tagIds: [] }, ctx)).toEqual({ ok: true });
    expect(gateTaskWrite(stored, { ...stored, estimatePomodoros: 5 }, ctx)).toEqual({
      ok: false,
      reason: "pro_required",
    });
  });

  it("treats empty notes as no notes", () => {
    expect(gateTaskWrite(null, { ...plain, notes: "" }, ctx)).toEqual({ ok: true });
  });
});

describe("projects and tags", () => {
  it("need Pro to be written", () => {
    expect(gateProItemWrite({ pro: false })).toEqual({ ok: false, reason: "pro_required" });
    expect(gateProItemWrite({ pro: true })).toEqual({ ok: true });
  });
});
