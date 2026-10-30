import { z } from "zod";
import { decideImport, decideTaskImport } from "@/features/auth/import-merge";
import { getCurrentUser } from "@/lib/current-user";
import { loadEntitlement } from "@/lib/entitlement";
import { prisma } from "@/lib/prisma";
import { isProActive } from "@/lib/pro";
import { FREE_ACTIVE_LIMIT } from "@/lib/tasks/contract";

const settingsSchema = z.object({
  focusMin: z.number().int().min(1).max(24 * 60),
  shortBreakMin: z.number().int().min(1).max(24 * 60),
  longBreakMin: z.number().int().min(1).max(24 * 60),
  longBreakEvery: z.number().int().min(1).max(20),
  autoStartFocus: z.boolean(),
  autoStartShortBreak: z.boolean(),
  autoStartLongBreak: z.boolean(),
  themeId: z.enum(["warm", "night", "forest"]),
});

const isoTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)));

const sessionSchema = z.object({
  id: z.uuid(),
  phase: z.enum(["FOCUS", "SHORT_BREAK", "LONG_BREAK"]),
  startedAt: isoTime,
  endedAt: isoTime,
  durationSec: z.number().int().positive().max(24 * 60 * 60),
  completed: z.boolean(),
  // Which task the guest was working on. Dropped below if the account does not end up owning it.
  taskId: z.uuid().nullable().optional(),
});

// A guest task has no Pro fields (projects, tags, notes, estimates, subtasks), so none are accepted here.
const taskSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(200),
  done: z.boolean(),
  doneAt: isoTime.nullable(),
  order: z.number().int().min(-1_000_000).max(1_000_000),
  createdAt: isoTime,
  updatedAt: isoTime,
});

const bodySchema = z.object({
  settings: settingsSchema,
  sessions: z.array(sessionSchema).max(200),
  tasks: z.array(taskSchema).max(500).default([]),
});

export async function POST(request: Request) {
  // The cookie session is the only proof of who is uploading.
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  const known = await prisma.focusSession.findMany({
    where: { userId: user.id, id: { in: parsed.data.sessions.map((session) => session.id) } },
    select: { id: true },
  });
  const existingSettings = await prisma.settings.findUnique({
    where: { userId: user.id },
    select: { userId: true },
  });
  const decision = decideImport(
    {
      hasSettings: existingSettings != null,
      sessionIds: new Set(known.map((session) => session.id)),
    },
    parsed.data,
  );
  const pro = isProActive(await loadEntitlement(user.id));

  const result = await prisma.$transaction(async (tx) => {
    if (decision.settings) {
      // Check again inside the transaction so a retry does not overwrite
      // settings another request just created.
      const row = await tx.settings.findUnique({
        where: { userId: user.id },
        select: { userId: true },
      });
      if (!row) {
        await tx.settings.create({
          data: {
            userId: user.id,
            ...decision.settings,
          },
        });
      }
    }

    // Tasks first, so the sessions below can point at them. Same lock as the tasks API:
    // the active-task count and the inserts must not interleave with another request.
    await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${user.id} FOR UPDATE`;
    const taskIds = parsed.data.tasks.map((task) => task.id);
    const sameIds = taskIds.length
      ? await tx.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, userId: true } })
      : [];
    const [activeCount, last] = await Promise.all([
      tx.task.count({ where: { userId: user.id, done: false, deletedAt: null, parentId: null } }),
      tx.task.aggregate({ where: { userId: user.id }, _max: { order: true } }),
    ]);
    const taskDecision = decideTaskImport(
      {
        knownIds: new Set(sameIds.filter((row) => row.userId === user.id).map((row) => row.id)),
        foreignIds: new Set(sameIds.filter((row) => row.userId !== user.id).map((row) => row.id)),
        activeCount,
        maxOrder: last._max.order ?? -1,
        pro,
      },
      parsed.data.tasks,
      FREE_ACTIVE_LIMIT,
    );
    if (taskDecision.insert.length > 0) {
      await tx.task.createMany({
        data: taskDecision.insert.map((task) => ({
          id: task.id,
          userId: user.id,
          title: task.title,
          done: task.done,
          doneAt: task.done ? new Date(task.doneAt ?? task.updatedAt) : null,
          order: task.order,
          createdAt: new Date(task.createdAt),
          updatedAt: new Date(task.updatedAt),
        })),
        skipDuplicates: true,
      });
    }

    // A session keeps its task only if this account really owns it (existing or just imported).
    const wanted = [...new Set(decision.sessions.flatMap((session) => (session.taskId ? [session.taskId] : [])))];
    const owned = new Set(
      wanted.length
        ? (await tx.task.findMany({ where: { userId: user.id, id: { in: wanted } }, select: { id: true } })).map(
            (task) => task.id,
          )
        : [],
    );
    if (decision.sessions.length > 0) {
      await tx.focusSession.createMany({
        data: decision.sessions.map((session) => ({
          id: session.id,
          userId: user.id,
          taskId: session.taskId && owned.has(session.taskId) ? session.taskId : null,
          phase: session.phase,
          startedAt: new Date(session.startedAt),
          endedAt: new Date(session.endedAt),
          durationSec: session.durationSec,
          completed: session.completed,
        })),
        skipDuplicates: true,
      });
    }
    return { importedTasks: taskDecision.insert.length, skippedTasks: taskDecision.skipped };
  });

  return Response.json({
    ok: true,
    importedSettings: decision.settings != null,
    importedSessions: decision.sessions.length,
    ...result,
  });
}
