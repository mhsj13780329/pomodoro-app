// What a browser uploads once, on first sign-in, from the data a guest made on this device.
import { THEME_IDS } from "@/lib/settings/catalog";
// Sessions use the same wire shape as the sync flush (POST /api/sessions), so the server can
// store them through the same writer and the same checks.

import { z } from "zod";
import { sessionInputSchema, wirePhases } from "@/lib/sync/contract";

export const importSettingsSchema = z.object({
  focusMin: z.number().int().min(1).max(24 * 60),
  shortBreakMin: z.number().int().min(1).max(24 * 60),
  longBreakMin: z.number().int().min(1).max(24 * 60),
  longBreakEvery: z.number().int().min(1).max(20),
  autoStartFocus: z.boolean(),
  autoStartShortBreak: z.boolean(),
  autoStartLongBreak: z.boolean(),
  themeId: z.enum(THEME_IDS),
});

export type ImportSettings = z.infer<typeof importSettingsSchema>;

const isoTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)));

/** A guest task has no Pro fields (projects, tags, notes, estimates, subtasks), so none are accepted. */
export const importTaskSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(200),
  done: z.boolean(),
  doneAt: isoTime.nullable(),
  order: z.number().int().min(-1_000_000).max(1_000_000),
  createdAt: isoTime,
  updatedAt: isoTime,
});

export type ImportTask = z.infer<typeof importTaskSchema>;

// A tab opened before this change still sends the database enum ("FOCUS"). Map it to the wire name.
const LEGACY_PHASE: Record<string, (typeof wirePhases)[number]> = {
  FOCUS: "focus",
  SHORT_BREAK: "shortBreak",
  LONG_BREAK: "longBreak",
};

const importSessionSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object") return value;
  const session = value as Record<string, unknown>;
  const phase = typeof session.phase === "string" ? (LEGACY_PHASE[session.phase] ?? session.phase) : session.phase;
  // Older tabs send no plannedSec. A guest focus ran its full planned length, so use the duration.
  const plannedSec =
    session.plannedSec ?? (typeof session.durationSec === "number" ? Math.max(1, session.durationSec) : undefined);
  return { ...session, phase, plannedSec };
}, sessionInputSchema);

export const importBodySchema = z.object({
  settings: importSettingsSchema,
  sessions: z.array(importSessionSchema).max(200),
  tasks: z.array(importTaskSchema).max(500).default([]),
});

export type ImportBody = z.infer<typeof importBodySchema>;

export type ImportResult = {
  ok: true;
  importedSettings: boolean;
  importedSessions: number;
  importedTasks: number;
  skippedTasks: number;
};
