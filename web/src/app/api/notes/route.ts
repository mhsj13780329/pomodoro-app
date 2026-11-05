import { guardSync, readJson } from "@/lib/sync/http";
import { noteBatchSchema } from "@/lib/notes/contract";
import { applyNoteBatch, readNotes } from "@/lib/notes/rows";

/** The signed-in user's notes changed since `?since=<cursor>` (all of them without it). Free accounts can read. */
export async function GET(request: Request) {
  const guard = await guardSync();
  if (guard instanceof Response) return guard;

  const raw = new URL(request.url).searchParams.get("since");
  const since = raw === null ? 0 : Number(raw);
  if (!Number.isFinite(since) || since < 0) return Response.json({ error: "invalid" }, { status: 400 });

  return Response.json(await readNotes(guard.userId, Math.floor(since), Date.now()));
}

/** Applies the note writes a device queued. The answer lists what happened to each note. */
export async function POST(request: Request) {
  const guard = await guardSync();
  if (guard instanceof Response) return guard;

  const json = await readJson(request);
  if (json instanceof Response) return json;
  const parsed = noteBatchSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  return Response.json(await applyNoteBatch(guard.userId, parsed.data, Date.now()));
}
