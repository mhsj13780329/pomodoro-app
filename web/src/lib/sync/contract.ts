import { z } from "zod";
import { tasksBlockSchema } from "@/lib/tasks/contract";

// Shared by the route handlers and the browser. No database import here,
// so client code can use these types without pulling in Prisma.

export const wirePhases = ["focus", "shortBreak", "longBreak"] as const;
export type WirePhase = (typeof wirePhases)[number];

export const wireStatuses = ["idle", "running", "paused"] as const;
export type WireStatus = (typeof wireStatuses)[number];

export type DbPhase = "FOCUS" | "SHORT_BREAK" | "LONG_BREAK";

export type DbStatus = "IDLE" | "RUNNING" | "PAUSED";

const phaseToDb: Record<WirePhase, DbPhase> = {
  focus: "FOCUS",
  shortBreak: "SHORT_BREAK",
  longBreak: "LONG_BREAK",
};

const phaseFromDb: Record<DbPhase, WirePhase> = {
  FOCUS: "focus",
  SHORT_BREAK: "shortBreak",
  LONG_BREAK: "longBreak",
};

const statusToDb: Record<WireStatus, DbStatus> = {
  idle: "IDLE",
  running: "RUNNING",
  paused: "PAUSED",
};

const statusFromDb: Record<DbStatus, WireStatus> = {
  IDLE: "idle",
  RUNNING: "running",
  PAUSED: "paused",
};

export function wirePhaseToDb(phase: WirePhase): DbPhase {
  return phaseToDb[phase];
}

export function dbPhaseToWire(phase: DbPhase): WirePhase {
  return phaseFromDb[phase];
}

export function wireStatusToDb(status: WireStatus): DbStatus {
  return statusToDb[status];
}

export function dbStatusToWire(status: DbStatus): WireStatus {
  return statusFromDb[status];
}

const minute = z.number().int().min(1).max(24 * 60);
const themeId = z.enum(["warm", "night", "forest"]);

export const settingsWireSchema = z.object({
  focusMin: minute,
  shortBreakMin: minute,
  longBreakMin: minute,
  longBreakEvery: z.number().int().min(1).max(20),
  autoStartFocus: z.boolean(),
  autoStartShortBreak: z.boolean(),
  autoStartLongBreak: z.boolean(),
  themeId,
  soundId: z.string().min(1).max(40),
  ambientId: z.string().min(1).max(40).nullable(),
  notificationsOn: z.boolean(),
  updatedAt: z.string(),
});

export type SettingsWire = z.infer<typeof settingsWireSchema>;

export const settingsPatchSchema = z
  .object({
    clientUpdatedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
    focusMin: minute.optional(),
    shortBreakMin: minute.optional(),
    longBreakMin: minute.optional(),
    longBreakEvery: z.number().int().min(1).max(20).optional(),
    autoStartFocus: z.boolean().optional(),
    autoStartShortBreak: z.boolean().optional(),
    autoStartLongBreak: z.boolean().optional(),
    themeId: themeId.optional(),
    soundId: z.string().min(1).max(40).optional(),
    ambientId: z.string().min(1).max(40).nullable().optional(),
    notificationsOn: z.boolean().optional(),
  })
  .strict();

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export const timerWireSchema = z.object({
  phase: z.enum(wirePhases),
  status: z.enum(wireStatuses),
  startedAt: z.string(),
  plannedSec: z.number().int(),
  pausedAt: z.string().nullable(),
  pausedTotalSec: z.number(),
  cycleIndex: z.number().int(),
  taskId: z.string().nullable(),
  version: z.number().int(),
  runId: z.string(),
  updatedAt: z.string(),
});

export type TimerWire = z.infer<typeof timerWireSchema>;

const expectedVersion = z.number().int().nonnegative();

export const timerCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), expectedVersion, runId: z.uuid() }).strict(),
  z.object({ action: z.literal("pause"), expectedVersion }).strict(),
  z.object({ action: z.literal("resume"), expectedVersion }).strict(),
  z.object({ action: z.literal("skip"), expectedVersion }).strict(),
  z.object({ action: z.literal("reset"), expectedVersion }).strict(),
  z
    .object({
      action: z.literal("select"),
      expectedVersion,
      phase: z.enum(wirePhases),
    })
    .strict(),
  z
    .object({
      action: z.literal("complete"),
      expectedVersion,
      runId: z.uuid().optional(),
    })
    .strict(),
]);

export type TimerCommand = z.infer<typeof timerCommandSchema>;

/**
 * Picks (or clears) the task for the focus session. Deliberately NOT version-checked:
 * it only changes ActiveTimer.taskId, never the countdown, so choosing a task on one
 * device cannot make another device's pause or complete fail with a 409.
 */
export const setTaskCommandSchema = z
  .object({
    action: z.literal("setTask"),
    taskId: z.uuid().nullable(),
  })
  .strict();

export type SetTaskCommand = z.infer<typeof setTaskCommandSchema>;

/** Anything the offline queue can hold for the timer. */
export type QueuedCommand = TimerCommand | SetTaskCommand;

export const sessionInputSchema = z
  .object({
    id: z.uuid(),
    phase: z.enum(wirePhases),
    startedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
    endedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
    durationSec: z.number().int().nonnegative(),
    plannedSec: z.number().int().positive(),
    completed: z.boolean(),
    taskId: z.string().nullable().optional(),
  })
  .strict();

export const sessionBatchSchema = z
  .object({
    sessions: z.array(sessionInputSchema).max(100),
  })
  .strict();

export type SessionInput = z.infer<typeof sessionInputSchema>;

export const syncStateSchema = z.object({
  serverNow: z.number(),
  settings: settingsWireSchema,
  activeTimer: timerWireSchema,
  /** Only present when the pull asked for it with ?tasksSince=. */
  tasks: tasksBlockSchema.optional(),
});

export type SyncState = z.infer<typeof syncStateSchema>;

export const sessionBatchResultSchema = z.object({
  serverNow: z.number(),
  accepted: z.array(z.string()),
  existing: z.array(z.string()),
  rejected: z.array(z.string()),
});

export type SessionBatchResult = z.infer<typeof sessionBatchResultSchema>;
