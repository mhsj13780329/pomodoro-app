import { z } from "zod";

// Shared by the route handlers and the browser. No database import here,
// so client code can use these types without pulling in Prisma.

/** Free accounts may have this many active (top-level, not done, not deleted) tasks. */
export const FREE_ACTIVE_LIMIT = 10;

/** Project colors are palette ids. The UI maps each one to a theme token, never to a hex value. */
export const PROJECT_COLORS = ["focus", "short", "long", "amber", "clay", "stone"] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

const isoTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)));

export const taskWireSchema = z
  .object({
    // Created on the device (crypto.randomUUID), so a retried request is idempotent.
    id: z.uuid(),
    title: z.string().trim().min(1).max(200),
    notes: z.string().max(5000).nullable(),
    estimatePomodoros: z.number().int().min(1).max(50).nullable(),
    done: z.boolean(),
    doneAt: isoTime.nullable(),
    order: z.number().int().min(-1_000_000).max(1_000_000),
    projectId: z.uuid().nullable(),
    parentId: z.uuid().nullable(),
    tagIds: z.array(z.uuid()).max(20),
    createdAt: isoTime,
    /** Client edit time. Last write wins on this value. */
    updatedAt: isoTime,
    /** Set when the task is deleted. The row stays so other devices learn about it. */
    deletedAt: isoTime.nullable(),
  })
  .strict();

export type TaskWire = z.infer<typeof taskWireSchema>;

export const projectWireSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(60),
    color: z.enum(PROJECT_COLORS),
    archived: z.boolean(),
    createdAt: isoTime,
    updatedAt: isoTime,
    deletedAt: isoTime.nullable(),
  })
  .strict();

export type ProjectWire = z.infer<typeof projectWireSchema>;

export const tagWireSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(40),
    createdAt: isoTime,
    updatedAt: isoTime,
    deletedAt: isoTime.nullable(),
  })
  .strict();

export type TagWire = z.infer<typeof tagWireSchema>;

/** One flush of queued writes. Each list is capped so a request stays small. */
export const taskBatchSchema = z
  .object({
    projects: z.array(projectWireSchema).max(100).default([]),
    tags: z.array(tagWireSchema).max(100).default([]),
    tasks: z.array(taskWireSchema).max(100).default([]),
  })
  .strict();

export type TaskBatch = z.infer<typeof taskBatchSchema>;

export const taskRejectReasons = ["active_limit", "pro_required", "invalid", "foreign"] as const;
export type TaskRejectReason = (typeof taskRejectReasons)[number];

export const taskItemResultSchema = z.object({
  kind: z.enum(["project", "tag", "task"]),
  id: z.string(),
  /**
   * applied  - stored as sent.
   * stale    - the server already had a newer (or equal) version; adopt `rows`.
   * rejected - not stored (limit, Pro, or not yours); adopt `rows` if the server has the item.
   */
  status: z.enum(["applied", "stale", "rejected"]),
  reason: z.enum(taskRejectReasons).optional(),
});

export type TaskItemResult = z.infer<typeof taskItemResultSchema>;

export const taskRowsSchema = z.object({
  projects: z.array(projectWireSchema),
  tags: z.array(tagWireSchema),
  tasks: z.array(taskWireSchema),
});

export type TaskRows = z.infer<typeof taskRowsSchema>;

export const taskBatchResultSchema = z.object({
  serverNow: z.number(),
  results: z.array(taskItemResultSchema),
  /** The server's current version of every stale or rejected item that exists there. */
  rows: taskRowsSchema,
  pro: z.boolean(),
});

export type TaskBatchResult = z.infer<typeof taskBatchResultSchema>;

/** The tasks part of a pull: everything changed since the cursor, plus derived pomodoro counts. */
export const tasksBlockSchema = z.object({
  /** Send this back as `tasksSince` on the next pull. */
  cursor: z.number(),
  /** True when the request had no cursor: the rows are the whole set, so local rows not listed are gone. */
  full: z.boolean(),
  projects: z.array(projectWireSchema),
  tags: z.array(tagWireSchema),
  tasks: z.array(taskWireSchema),
  /** taskId -> completed focus sessions. Derived from FocusSession, never stored. */
  counts: z.record(z.string(), z.number().int().nonnegative()),
  pro: z.boolean(),
});

export type TasksBlock = z.infer<typeof tasksBlockSchema>;
