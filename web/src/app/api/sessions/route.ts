import { sessionBatchSchema } from "@/lib/sync/contract";
import { guardSync, readJson } from "@/lib/sync/http";
import { storeSessions } from "@/lib/sync/rows";

export async function POST(request: Request) {
  const guard = await guardSync();
  if (guard instanceof Response) return guard;

  const json = await readJson(request);
  if (json instanceof Response) return json;
  const parsed = sessionBatchSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  const serverNow = Date.now();
  const result = await storeSessions(guard.userId, parsed.data.sessions, serverNow);
  return Response.json(result);
}
