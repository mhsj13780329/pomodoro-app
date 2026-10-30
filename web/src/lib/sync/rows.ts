import "server-only";
import { Prisma, type ActiveTimer, type Settings } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { canComplete } from "@/lib/timer/remaining";
import { applyTimerAction, type PhaseSettings, type TimerAction, type TransitionTimer } from "@/lib/timer/transitions";
import { mergeSettings, type SyncSettings } from "./settings-lww";
import {
  dbPhaseToWire,
  dbStatusToWire,
  wirePhaseToDb,
  wireStatusToDb,
  type SessionInput,
  type SettingsPatch,
  type SettingsWire,
  type SyncState,
  type TimerCommand,
  type TimerWire,
} from "./contract";
import { classifySessionBatch } from "./sessions";

// Matches the guest timer so the first signed-in paint is the familiar 25/5/15.
const DEFAULT_SETTINGS = {
  focusMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4,
  autoStartFocus: false,
  autoStartShortBreak: true,
  autoStartLongBreak: true,
  themeId: "warm",
  soundId: "default",
  notificationsOn: true,
};

export type TimerWrite = {
  kind: "ok" | "conflict" | "early";
  state: SyncState;
};

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Creates the settings row on first read.
 * Not an upsert: an empty update would still move updatedAt, and then every
 * poll would look like a newer edit and block a real save from another device.
 */
async function ensureSettings(userId: string): Promise<Settings> {
  const existing = await prisma.settings.findUnique({ where: { userId } });
  if (existing) return existing;
  try {
    return await prisma.settings.create({ data: { userId, ...DEFAULT_SETTINGS } });
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const row = await prisma.settings.findUnique({ where: { userId } });
    if (!row) throw error;
    return row;
  }
}

/** Same idea for the timer. A missing row means "idle at the default focus", not an error. */
async function ensureTimer(userId: string, now: Date): Promise<ActiveTimer> {
  const existing = await prisma.activeTimer.findUnique({ where: { userId } });
  if (existing) return existing;
  try {
    return await prisma.activeTimer.create({
      data: {
        userId,
        phase: "FOCUS",
        status: "IDLE",
        startedAt: now,
        plannedSec: DEFAULT_SETTINGS.focusMin * 60,
        pausedTotalSec: 0,
        cycleIndex: 0,
        runId: crypto.randomUUID(),
        version: 0,
      },
    });
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const row = await prisma.activeTimer.findUnique({ where: { userId } });
    if (!row) throw error;
    return row;
  }
}

export async function readSyncState(userId: string, serverNow: number): Promise<SyncState> {
  const now = new Date(serverNow);
  const [settings, activeTimer] = await Promise.all([ensureSettings(userId), ensureTimer(userId, now)]);
  return payload(serverNow, settings, activeTimer);
}

function payload(serverNow: number, settings: Settings, timer: ActiveTimer): SyncState {
  return {
    serverNow,
    settings: serializeSettings(settings),
    activeTimer: serializeTimer(timer),
  };
}

function serializeSettings(row: Settings): SettingsWire {
  return {
    focusMin: row.focusMin,
    shortBreakMin: row.shortBreakMin,
    longBreakMin: row.longBreakMin,
    longBreakEvery: row.longBreakEvery,
    autoStartFocus: row.autoStartFocus,
    autoStartShortBreak: row.autoStartShortBreak,
    autoStartLongBreak: row.autoStartLongBreak,
    themeId: row.themeId === "night" || row.themeId === "forest" ? row.themeId : "warm",
    soundId: row.soundId,
    ambientId: row.ambientId,
    notificationsOn: row.notificationsOn,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeTimer(row: ActiveTimer): TimerWire {
  return {
    phase: dbPhaseToWire(row.phase),
    status: dbStatusToWire(row.status),
    startedAt: row.startedAt.toISOString(),
    plannedSec: row.plannedSec,
    pausedAt: row.pausedAt ? row.pausedAt.toISOString() : null,
    pausedTotalSec: row.pausedTotalSec,
    cycleIndex: row.cycleIndex,
    taskId: row.taskId,
    version: row.version,
    runId: row.runId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSyncSettings(row: Settings): SyncSettings {
  return {
    focusMin: row.focusMin,
    shortBreakMin: row.shortBreakMin,
    longBreakMin: row.longBreakMin,
    longBreakEvery: row.longBreakEvery,
    autoStartFocus: row.autoStartFocus,
    autoStartShortBreak: row.autoStartShortBreak,
    autoStartLongBreak: row.autoStartLongBreak,
    themeId: row.themeId,
    soundId: row.soundId,
    ambientId: row.ambientId,
    notificationsOn: row.notificationsOn,
    updatedAt: row.updatedAt.getTime(),
  };
}

function phaseSettings(row: Settings): PhaseSettings {
  return {
    focusSec: row.focusMin * 60,
    shortBreakSec: row.shortBreakMin * 60,
    longBreakSec: row.longBreakMin * 60,
    longBreakEvery: row.longBreakEvery,
    autoStartFocus: row.autoStartFocus,
    autoStartShortBreak: row.autoStartShortBreak,
    autoStartLongBreak: row.autoStartLongBreak,
  };
}

function toTransition(row: ActiveTimer): TransitionTimer {
  return {
    phase: dbPhaseToWire(row.phase),
    status: dbStatusToWire(row.status),
    // Idle ignores the stored timestamp. Keeping it null matches the guest store.
    startedAt: row.status === "IDLE" ? null : row.startedAt.getTime(),
    plannedSec: row.plannedSec,
    pausedAt: row.pausedAt ? row.pausedAt.getTime() : null,
    pausedTotalSec: row.pausedTotalSec,
    cycleIndex: row.cycleIndex,
    runId: row.runId,
    version: row.version,
    taskId: row.taskId,
  };
}

function commandToAction(command: TimerCommand): TimerAction {
  switch (command.action) {
    case "start":
      return { type: "start", runId: command.runId };
    case "select":
      return { type: "select", phase: command.phase };
    case "complete":
      // The client sends the id it already showed. If it did not, mint one here.
      return { type: "complete", nextRunId: command.runId ?? crypto.randomUUID() };
    case "pause":
    case "resume":
    case "skip":
    case "reset":
      return { type: command.action };
    default: {
      const _never: never = command;
      return _never;
    }
  }
}

/**
 * Applies one timer action only when expectedVersion still matches.
 * The check and the write share a transaction so two devices cannot both win.
 * A finished focus is inserted in that same transaction, with id = runId.
 */
export async function writeTimer(userId: string, command: TimerCommand, serverNow: number): Promise<TimerWrite> {
  await Promise.all([ensureSettings(userId), ensureTimer(userId, new Date(serverNow))]);

  const outcome = await prisma.$transaction(async (tx) => {
    const current = await tx.activeTimer.findUnique({ where: { userId } });
    const settings = await tx.settings.findUnique({ where: { userId } });
    if (!current || !settings) return { kind: "missing" as const };

    if (current.version !== command.expectedVersion) {
      return { kind: "conflict" as const, current, settings };
    }

    const timer = toTransition(current);
    if (command.action === "complete" && !canComplete(timer, serverNow)) {
      return { kind: "early" as const, current, settings };
    }

    const step = applyTimerAction(timer, phaseSettings(settings), commandToAction(command), serverNow);
    if (!step.changed) return { kind: "ok" as const, current, settings };

    // updateMany with the version in the WHERE is the real lock. The read above
    // can be stale if the other device committed a moment earlier.
    const updated = await tx.activeTimer.updateMany({
      where: { userId, version: command.expectedVersion },
      data: {
        phase: wirePhaseToDb(step.timer.phase),
        status: wireStatusToDb(step.timer.status),
        startedAt: new Date(step.timer.startedAt ?? serverNow),
        plannedSec: Math.round(step.timer.plannedSec),
        pausedAt: step.timer.pausedAt == null ? null : new Date(step.timer.pausedAt),
        pausedTotalSec: Math.round(step.timer.pausedTotalSec),
        cycleIndex: step.timer.cycleIndex,
        runId: step.timer.runId,
        version: step.timer.version,
        taskId: step.timer.taskId,
      },
    });
    if (updated.count !== 1) {
      const fresh = await tx.activeTimer.findUnique({ where: { userId } });
      return { kind: "conflict" as const, current: fresh ?? current, settings };
    }

    if (step.session) {
      await tx.focusSession.createMany({
        data: [
          {
            id: step.session.id,
            userId,
            taskId: step.session.taskId,
            phase: "FOCUS",
            startedAt: new Date(step.session.startedAt),
            endedAt: new Date(step.session.endedAt),
            durationSec: step.session.durationSec,
            completed: true,
          },
        ],
        skipDuplicates: true,
      });
    }

    const saved = await tx.activeTimer.findUnique({ where: { userId } });
    return { kind: "ok" as const, current: saved ?? current, settings };
  });

  if (outcome.kind === "missing") {
    throw new Error("Sync rows were missing after they were created");
  }
  return { kind: outcome.kind, state: payload(serverNow, outcome.settings, outcome.current) };
}

/**
 * Last-write-wins for settings. The stored updatedAt is the client's edit time,
 * not the moment this request arrived, so a slow older save cannot win.
 * The WHERE clause makes that check atomic with the write.
 */
export async function writeSettings(userId: string, patch: SettingsPatch, serverNow: number): Promise<SyncState> {
  await Promise.all([ensureSettings(userId), ensureTimer(userId, new Date(serverNow))]);
  const row = await prisma.settings.findUnique({ where: { userId } });
  if (!row) throw new Error("Settings row was missing after it was created");

  const stored = toSyncSettings(row);
  const { clientUpdatedAt, ...fields } = patch;
  const merged = mergeSettings(stored, Date.parse(clientUpdatedAt), fields);
  if (merged !== stored) {
    const editedAt = new Date(merged.updatedAt);
    await prisma.$executeRaw`
      UPDATE "Settings"
      SET
        "focusMin" = ${merged.focusMin},
        "shortBreakMin" = ${merged.shortBreakMin},
        "longBreakMin" = ${merged.longBreakMin},
        "longBreakEvery" = ${merged.longBreakEvery},
        "autoStartFocus" = ${merged.autoStartFocus},
        "autoStartShortBreak" = ${merged.autoStartShortBreak},
        "autoStartLongBreak" = ${merged.autoStartLongBreak},
        "themeId" = ${merged.themeId},
        "soundId" = ${merged.soundId},
        "ambientId" = ${merged.ambientId},
        "notificationsOn" = ${merged.notificationsOn},
        "updatedAt" = ${editedAt}
      WHERE "userId" = ${userId} AND "updatedAt" < ${editedAt}
    `;
  }

  const [settings, activeTimer] = await Promise.all([
    prisma.settings.findUnique({ where: { userId } }),
    prisma.activeTimer.findUnique({ where: { userId } }),
  ]);
  if (!settings || !activeTimer) throw new Error("Sync rows were missing after a settings write");
  return payload(serverNow, settings, activeTimer);
}

/**
 * Inserts queued sessions. An id that already exists is reported, not inserted again.
 * An unknown task id is stored as null: the focus itself must not be dropped.
 */
export async function storeSessions(userId: string, sessions: SessionInput[], serverNow: number) {
  const ids = sessions.map((session) => session.id);
  const existing = ids.length
    ? await prisma.focusSession.findMany({
        where: { id: { in: ids } },
        select: { id: true, userId: true },
      })
    : [];
  const knownIds = new Set(existing.filter((row) => row.userId === userId).map((row) => row.id));
  const foreignIds = new Set(existing.filter((row) => row.userId !== userId).map((row) => row.id));

  const taskIds = [...new Set(sessions.flatMap((session) => (session.taskId ? [session.taskId] : [])))];
  const owned = new Set(
    taskIds.length
      ? (
          await prisma.task.findMany({
            where: { userId, id: { in: taskIds } },
            select: { id: true },
          })
        ).map((task) => task.id)
      : [],
  );
  const normalized = sessions.map((session) => ({
    ...session,
    taskId: session.taskId && owned.has(session.taskId) ? session.taskId : null,
  }));

  const batch = classifySessionBatch(normalized, knownIds, foreignIds, serverNow);
  if (batch.insert.length > 0) {
    await prisma.focusSession.createMany({
      data: batch.insert.map((session) => ({
        id: session.id,
        userId,
        taskId: session.taskId,
        phase: wirePhaseToDb(session.phase),
        startedAt: new Date(session.startedAt),
        endedAt: new Date(session.endedAt),
        durationSec: session.durationSec,
        completed: session.completed,
      })),
      skipDuplicates: true,
    });
  }

  return {
    serverNow,
    accepted: batch.accepted,
    existing: batch.existing,
    rejected: batch.rejected,
  };
}
