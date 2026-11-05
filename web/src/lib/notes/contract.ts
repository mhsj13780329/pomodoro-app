import { z } from "zod";

// Shared by the route handler and the browser. No database import here.

export const NOTE_TITLE_MAX = 200;
export const NOTE_BODY_MAX = 20_000;
export const NOTE_BATCH_MAX = 50;

const isoTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)));

export const noteWireSchema = z
  .object({
    // Created on the device (crypto.randomUUID), so a retried request is idempotent.
    id: z.uuid(),
    title: z.string().max(NOTE_TITLE_MAX),
    body: z.string().max(NOTE_BODY_MAX),
    createdAt: isoTime,
    /** Client edit time. Last write wins on this value. */
    updatedAt: isoTime,
    /** Set when the note is deleted. The row stays so other devices learn about it. */
    deletedAt: isoTime.nullable(),
  })
  .strict();

export type NoteWire = z.infer<typeof noteWireSchema>;

/** One flush of queued writes. */
export const noteBatchSchema = z
  .object({ notes: z.array(noteWireSchema).max(NOTE_BATCH_MAX) })
  .strict();

export type NoteBatch = z.infer<typeof noteBatchSchema>;

export const noteItemResultSchema = z.object({
  id: z.string(),
  /**
   * ok           - stored as sent.
   * stale        - the server already had a newer (or equal) version, or the note is deleted; adopt `rows`.
   * pro_required - not stored because the account is not Pro; adopt `rows` if the server has the note.
   */
  status: z.enum(["ok", "stale", "pro_required"]),
});

export type NoteItemResult = z.infer<typeof noteItemResultSchema>;

export const noteBatchResultSchema = z.object({
  serverNow: z.number(),
  results: z.array(noteItemResultSchema),
  /** The server's current version of every stale or rejected note that exists there. */
  rows: z.array(noteWireSchema),
  pro: z.boolean(),
});

export type NoteBatchResult = z.infer<typeof noteBatchResultSchema>;

/** Answer to GET /api/notes?since=<cursor>. Readable by free accounts too. */
export const notePullSchema = z.object({
  /** Send this back as `since` on the next pull. */
  cursor: z.number(),
  /** True when the request had no cursor: the rows are the whole live set. */
  full: z.boolean(),
  notes: z.array(noteWireSchema),
  pro: z.boolean(),
});

export type NotePull = z.infer<typeof notePullSchema>;
