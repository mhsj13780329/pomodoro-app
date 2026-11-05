import "server-only";
import type { Note, Prisma } from "@/generated/prisma/client";
import { loadEntitlement } from "@/lib/entitlement";
import { prisma } from "@/lib/prisma";
import { isProActive } from "@/lib/pro";
import type { NoteBatch, NoteBatchResult, NoteItemResult, NotePull, NoteWire } from "./contract";
import { decideNoteWrite } from "./gate";

type Tx = Prisma.TransactionClient;

/** Pull asks for rows changed since the cursor, minus this overlap, so a slow commit is never missed. */
const CURSOR_OVERLAP_MS = 5_000;

const iso = (date: Date) => date.toISOString();

export function serializeNote(row: Note): NoteWire {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    taskId: row.taskId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    deletedAt: row.deletedAt ? iso(row.deletedAt) : null,
  };
}

const stampOf = (row: Note) => ({ title: row.title, body: row.body, taskId: row.taskId, updatedAt: iso(row.updatedAt), deletedAt: row.deletedAt ? iso(row.deletedAt) : null });

/** Same per-user lock the tasks batch takes, so two requests from one user run one after the other. */
async function lockUser(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${userId} FOR UPDATE`;
}

/**
 * Applies one flush of queued note writes in a single transaction. Pro is read on the server;
 * each item is judged on its own and gets ok, stale or pro_required.
 */
export async function applyNoteBatch(userId: string, batch: NoteBatch, serverNow: number): Promise<NoteBatchResult> {
  const pro = isProActive(await loadEntitlement(userId), serverNow);
  const results: NoteItemResult[] = [];
  const rows: NoteWire[] = [];

  await prisma.$transaction(
    async (tx) => {
      await lockUser(tx, userId);
      for (const incoming of batch.notes) {
        const stored = await tx.note.findUnique({ where: { id: incoming.id } });
        // Another user's id: say nothing about it.
        if (stored && stored.userId !== userId) {
          results.push({ id: incoming.id, status: "stale" });
          continue;
        }
        const decision = decideNoteWrite(stored ? stampOf(stored) : null, incoming, { pro });
        if (decision === "stale" || decision === "pro_required") {
          results.push({ id: incoming.id, status: decision });
          if (stored) rows.push(serializeNote(stored));
          continue;
        }

        const updatedAt = new Date(incoming.updatedAt);
        const deletedAt = incoming.deletedAt ? new Date(incoming.deletedAt) : null;
        if (decision === "insert") {
          await tx.note.create({
            data: {
              id: incoming.id,
              userId,
              title: incoming.title,
              body: incoming.body,
              taskId: incoming.taskId,
              createdAt: new Date(incoming.createdAt),
              updatedAt,
            },
          });
        } else if (!stored) {
          // A delete for a note the server never saw: keep only an empty tombstone so no content is stored.
          await tx.note.create({
            data: { id: incoming.id, userId, title: "", body: "", taskId: null, createdAt: new Date(incoming.createdAt), updatedAt, deletedAt },
          });
        } else {
          // The WHERE makes "only if still older and live" atomic with the write.
          // A delete never changes content, so a free account cannot edit text through it.
          const data =
            decision === "delete" ? { updatedAt, deletedAt } : { title: incoming.title, body: incoming.body, taskId: incoming.taskId, updatedAt };
          const updated = await tx.note.updateMany({
            where: { id: incoming.id, userId, deletedAt: null, updatedAt: { lt: updatedAt } },
            data,
          });
          if (updated.count !== 1) {
            results.push({ id: incoming.id, status: "stale" });
            const fresh = await tx.note.findUnique({ where: { id: incoming.id } });
            if (fresh) rows.push(serializeNote(fresh));
            continue;
          }
        }
        results.push({ id: incoming.id, status: "ok" });
      }
    },
    { timeout: 20_000 },
  );

  return { serverNow, results, rows, pro };
}

/**
 * Notes changed since `since` (ms), or the whole live set when `since` is 0.
 * Deleted rows are in a delta so a delete reaches other devices. Never gated: a free account reads its notes.
 */
export async function readNotes(userId: string, since: number, serverNow: number): Promise<NotePull> {
  const full = since <= 0;
  const [rows, entitlement] = await Promise.all([
    prisma.note.findMany({
      where: { userId, ...(full ? { deletedAt: null } : { serverUpdatedAt: { gt: new Date(since) } }) },
      orderBy: { serverUpdatedAt: "asc" },
    }),
    loadEntitlement(userId),
  ]);
  return {
    cursor: serverNow - CURSOR_OVERLAP_MS,
    full,
    notes: rows.map(serializeNote),
    pro: isProActive(entitlement, serverNow),
  };
}
