import "server-only";
import type { Prisma, Project, Tag, Task } from "@/generated/prisma/client";
import { loadEntitlement } from "@/lib/entitlement";
import { prisma } from "@/lib/prisma";
import { ProRequiredError, requirePro, type Entitlement } from "@/lib/pro";
import {
  type ProjectWire,
  type TagWire,
  type TaskBatch,
  type TaskBatchResult,
  type TaskItemResult,
  type TaskRejectReason,
  type TaskRows,
  type TasksBlock,
  type TaskWire,
} from "./contract";
import { gateProItemWrite, gateTaskWrite, isActiveTask } from "./gate";
import { decideLww, type Stamped } from "./merge";

type Tx = Prisma.TransactionClient;
type TaskRow = Task & { tags: { tagId: string }[] };

/** Pull asks for rows changed since the cursor, minus this overlap, so a slow commit is never missed. */
const CURSOR_OVERLAP_MS = 5_000;

// ---------- serialize ----------

const iso = (date: Date) => date.toISOString();

export function serializeProject(row: Project): ProjectWire {
  return {
    id: row.id,
    name: row.name,
    color: row.color as ProjectWire["color"],
    archived: row.archived,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    deletedAt: row.deletedAt ? iso(row.deletedAt) : null,
  };
}

export function serializeTag(row: Tag): TagWire {
  return {
    id: row.id,
    name: row.name,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    deletedAt: row.deletedAt ? iso(row.deletedAt) : null,
  };
}

export function serializeTask(row: TaskRow): TaskWire {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    estimatePomodoros: row.estimatePomodoros,
    done: row.done,
    doneAt: row.doneAt ? iso(row.doneAt) : null,
    order: row.order,
    projectId: row.projectId,
    parentId: row.parentId,
    tagIds: row.tags.map((tag) => tag.tagId).sort(),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    deletedAt: row.deletedAt ? iso(row.deletedAt) : null,
  };
}

function stamp(row: { id: string; updatedAt: Date; deletedAt: Date | null }): Stamped {
  return { id: row.id, updatedAt: iso(row.updatedAt), deletedAt: row.deletedAt ? iso(row.deletedAt) : null };
}

/** The single Pro check for a whole request. Everything below asks this, never the UI. */
function proAllowed(entitlement: Entitlement, now: number): boolean {
  try {
    requirePro(entitlement, now);
    return true;
  } catch (error) {
    if (error instanceof ProRequiredError) return false;
    throw error;
  }
}

/**
 * Locks this user's row until the transaction ends. Two requests from the same user
 * (two devices, or a retry) then run one after the other, so both cannot see "9 active
 * tasks" and both insert a 10th.
 */
async function lockUser(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${userId} FOR UPDATE`;
}

// ---------- writes ----------

type Collector = {
  results: TaskItemResult[];
  rows: TaskRows;
};

function reject(out: Collector, kind: TaskItemResult["kind"], id: string, reason: TaskRejectReason) {
  out.results.push({ kind, id, status: "rejected", reason });
}

async function applyProject(tx: Tx, userId: string, incoming: ProjectWire, pro: boolean, out: Collector) {
  const stored = await tx.project.findUnique({ where: { id: incoming.id } });
  if (stored && stored.userId !== userId) return reject(out, "project", incoming.id, "foreign");

  const decision = decideLww(stored ? stamp(stored) : null, incoming);
  if (decision === "stale") {
    out.results.push({ kind: "project", id: incoming.id, status: "stale" });
    if (stored) out.rows.projects.push(serializeProject(stored));
    return;
  }
  const gate = gateProItemWrite({ pro });
  if (!gate.ok) {
    reject(out, "project", incoming.id, gate.reason);
    if (stored) out.rows.projects.push(serializeProject(stored));
    return;
  }

  const data = {
    name: incoming.name,
    color: incoming.color,
    archived: incoming.archived,
    updatedAt: new Date(incoming.updatedAt),
    deletedAt: incoming.deletedAt ? new Date(incoming.deletedAt) : null,
  };
  if (decision === "insert") {
    await tx.project.create({ data: { id: incoming.id, userId, createdAt: new Date(incoming.createdAt), ...data } });
  } else {
    // The WHERE makes "only if still older" atomic with the write.
    const updated = await tx.project.updateMany({
      where: { id: incoming.id, userId, deletedAt: null, updatedAt: { lt: data.updatedAt } },
      data,
    });
    if (updated.count !== 1) {
      out.results.push({ kind: "project", id: incoming.id, status: "stale" });
      const fresh = await tx.project.findUnique({ where: { id: incoming.id } });
      if (fresh) out.rows.projects.push(serializeProject(fresh));
      return;
    }
  }
  out.results.push({ kind: "project", id: incoming.id, status: "applied" });
}

async function applyTag(tx: Tx, userId: string, incoming: TagWire, pro: boolean, out: Collector) {
  const stored = await tx.tag.findUnique({ where: { id: incoming.id } });
  if (stored && stored.userId !== userId) return reject(out, "tag", incoming.id, "foreign");

  const decision = decideLww(stored ? stamp(stored) : null, incoming);
  if (decision === "stale") {
    out.results.push({ kind: "tag", id: incoming.id, status: "stale" });
    if (stored) out.rows.tags.push(serializeTag(stored));
    return;
  }
  const gate = gateProItemWrite({ pro });
  if (!gate.ok) {
    reject(out, "tag", incoming.id, gate.reason);
    if (stored) out.rows.tags.push(serializeTag(stored));
    return;
  }

  const data = {
    name: incoming.name,
    updatedAt: new Date(incoming.updatedAt),
    deletedAt: incoming.deletedAt ? new Date(incoming.deletedAt) : null,
  };
  if (decision === "insert") {
    await tx.tag.create({ data: { id: incoming.id, userId, createdAt: new Date(incoming.createdAt), ...data } });
  } else {
    const updated = await tx.tag.updateMany({
      where: { id: incoming.id, userId, deletedAt: null, updatedAt: { lt: data.updatedAt } },
      data,
    });
    if (updated.count !== 1) {
      out.results.push({ kind: "tag", id: incoming.id, status: "stale" });
      const fresh = await tx.tag.findUnique({ where: { id: incoming.id } });
      if (fresh) out.rows.tags.push(serializeTag(fresh));
      return;
    }
  }
  out.results.push({ kind: "tag", id: incoming.id, status: "applied" });
}

type TaskState = {
  /** Active tasks this user has right now (kept up to date as the batch applies). */
  active: number;
  /** Tasks that were finished or deleted in this batch; the timer must stop pointing at them. */
  cleared: Set<string>;
};

async function applyTask(
  tx: Tx,
  userId: string,
  incoming: TaskWire,
  pro: boolean,
  state: TaskState,
  out: Collector,
) {
  const stored = await tx.task.findUnique({ where: { id: incoming.id }, include: { tags: { select: { tagId: true } } } });
  if (stored && stored.userId !== userId) return reject(out, "task", incoming.id, "foreign");

  const decision = decideLww(stored ? stamp(stored) : null, incoming);
  const keepStored = () => {
    if (stored) out.rows.tasks.push(serializeTask(stored));
  };
  if (decision === "stale") {
    out.results.push({ kind: "task", id: incoming.id, status: "stale" });
    keepStored();
    return;
  }

  // Check every id the task points at belongs to this user. A project or tag that no longer
  // exists is dropped (the task is still valid); a missing parent is an error.
  const projectId = incoming.projectId
    ? ((await tx.project.findFirst({ where: { id: incoming.projectId, userId }, select: { id: true } }))?.id ?? null)
    : null;
  const tagIds = incoming.tagIds.length
    ? (await tx.tag.findMany({ where: { id: { in: incoming.tagIds }, userId }, select: { id: true } })).map((tag) => tag.id)
    : [];
  if (incoming.parentId) {
    const parent = await tx.task.findFirst({
      where: { id: incoming.parentId, userId },
      select: { id: true, parentId: true },
    });
    const hasChildren = (await tx.task.count({ where: { parentId: incoming.id } })) > 0;
    // Subtasks are one level deep: a parent cannot itself be a subtask, and a task with subtasks cannot become one.
    if (!parent || parent.parentId != null || parent.id === incoming.id || hasChildren) {
      reject(out, "task", incoming.id, "invalid");
      keepStored();
      return;
    }
  }
  const next: TaskWire = { ...incoming, projectId, tagIds, notes: incoming.notes === "" ? null : incoming.notes };

  const storedWire = stored ? serializeTask(stored) : null;
  const storedActive = storedWire ? isActiveTask(storedWire) : false;
  const gate = gateTaskWrite(storedWire, next, { pro, activeCount: state.active - (storedActive ? 1 : 0) });
  if (!gate.ok) {
    reject(out, "task", incoming.id, gate.reason);
    keepStored();
    return;
  }

  const updatedAt = new Date(next.updatedAt);
  const deletedAt = next.deletedAt ? new Date(next.deletedAt) : null;
  const data = {
    title: next.title,
    notes: next.notes,
    estimatePomodoros: next.estimatePomodoros,
    done: next.done,
    doneAt: next.done ? new Date(next.doneAt ?? next.updatedAt) : null,
    order: next.order,
    projectId: next.projectId,
    parentId: next.parentId,
    updatedAt,
    deletedAt,
  };

  if (decision === "insert") {
    await tx.task.create({
      data: {
        id: next.id,
        userId,
        createdAt: new Date(next.createdAt),
        ...data,
        tags: { create: next.tagIds.map((tagId) => ({ tagId })) },
      },
    });
  } else {
    const updated = await tx.task.updateMany({
      where: { id: next.id, userId, deletedAt: null, updatedAt: { lt: updatedAt } },
      data,
    });
    if (updated.count !== 1) {
      out.results.push({ kind: "task", id: incoming.id, status: "stale" });
      const fresh = await tx.task.findUnique({ where: { id: incoming.id }, include: { tags: { select: { tagId: true } } } });
      if (fresh) out.rows.tasks.push(serializeTask(fresh));
      return;
    }
    await tx.taskTag.deleteMany({ where: { taskId: next.id } });
    if (next.tagIds.length > 0) {
      await tx.taskTag.createMany({ data: next.tagIds.map((tagId) => ({ taskId: next.id, tagId })) });
    }
  }

  state.active += (isActiveTask(next) ? 1 : 0) - (storedActive ? 1 : 0);

  if (next.deletedAt != null) {
    // Deleting a task deletes its subtasks too, so they do not linger on other devices.
    const children = await tx.task.findMany({
      where: { userId, parentId: next.id, deletedAt: null },
      select: { id: true },
    });
    if (children.length > 0) {
      await tx.task.updateMany({
        where: { id: { in: children.map((child) => child.id) } },
        data: { deletedAt, updatedAt },
      });
      for (const child of children) state.cleared.add(child.id);
    }
  }
  if (next.done || next.deletedAt != null) state.cleared.add(next.id);

  out.results.push({ kind: "task", id: incoming.id, status: "applied" });
}

/**
 * Applies one flush of queued task, project and tag writes.
 * The whole batch is one transaction behind a per-user lock, so the active-task limit
 * cannot be beaten by two requests at once. Each item is judged on its own: a rejected
 * item does not stop the others.
 */
export async function applyTaskBatch(userId: string, batch: TaskBatch, serverNow: number): Promise<TaskBatchResult> {
  const pro = proAllowed(await loadEntitlement(userId), serverNow);
  const out: Collector = { results: [], rows: { projects: [], tags: [], tasks: [] } };
  // Parents before their subtasks, so a subtask created in the same flush finds its parent.
  const tasks = [...batch.tasks].sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0));

  await prisma.$transaction(
    async (tx) => {
      await lockUser(tx, userId);
      const state: TaskState = {
        active: await tx.task.count({ where: { userId, done: false, deletedAt: null, parentId: null } }),
        cleared: new Set(),
      };
      for (const project of batch.projects) await applyProject(tx, userId, project, pro, out);
      for (const tag of batch.tags) await applyTag(tx, userId, tag, pro, out);
      for (const task of tasks) await applyTask(tx, userId, task, pro, state, out);

      if (state.cleared.size > 0) {
        // The running timer keeps running. It just stops pointing at a task that is done or gone.
        // No version bump: this must not make another device's pause or complete fail.
        await tx.activeTimer.updateMany({
          where: { userId, taskId: { in: [...state.cleared] } },
          data: { taskId: null },
        });
      }
    },
    { timeout: 20_000 },
  );

  return { serverNow, results: out.results, rows: out.rows, pro };
}

/**
 * Picks (or clears) the task for the focus session. Not version-checked, see setTaskCommandSchema.
 * A task that is missing, done or deleted is stored as null instead of failing.
 */
export async function selectTask(userId: string, taskId: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const valid = taskId
      ? await tx.task.findFirst({ where: { id: taskId, userId, done: false, deletedAt: null }, select: { id: true } })
      : null;
    await tx.activeTimer.updateMany({ where: { userId }, data: { taskId: valid?.id ?? null } });
  });
}

// ---------- reads ----------

/**
 * Everything that changed since `since` (ms), or the whole live set when `since` is 0.
 * Deleted rows are included in a delta so a delete reaches the other devices.
 * `counts` is derived from FocusSession on every pull; no counter is stored anywhere.
 */
export async function readTasksBlock(userId: string, since: number, serverNow: number): Promise<TasksBlock> {
  const full = since <= 0;
  const changed = full ? { deletedAt: null } : { serverUpdatedAt: { gt: new Date(since) } };

  const [tasks, projects, tags, grouped, entitlement] = await Promise.all([
    prisma.task.findMany({ where: { userId, ...changed }, include: { tags: { select: { tagId: true } } } }),
    prisma.project.findMany({ where: { userId, ...changed } }),
    prisma.tag.findMany({ where: { userId, ...changed } }),
    prisma.focusSession.groupBy({
      by: ["taskId"],
      where: { userId, phase: "FOCUS", completed: true, task: { deletedAt: null } },
      _count: { _all: true },
    }),
    loadEntitlement(userId),
  ]);

  const counts: Record<string, number> = {};
  for (const group of grouped) if (group.taskId) counts[group.taskId] = group._count._all;

  return {
    cursor: serverNow - CURSOR_OVERLAP_MS,
    full,
    projects: projects.map(serializeProject),
    tags: tags.map(serializeTag),
    tasks: tasks.map(serializeTask),
    counts,
    pro: proAllowed(entitlement, serverNow),
  };
}
