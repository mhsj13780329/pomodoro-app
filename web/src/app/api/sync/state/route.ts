import { guardSync } from "@/lib/sync/http";
import { readSyncState } from "@/lib/sync/rows";
import { readTasksBlock } from "@/lib/tasks/rows";

export async function GET(request: Request) {
  const guard = await guardSync();
  if (guard instanceof Response) return guard;
  // One clock reading for the whole response. The client derives its offset from it.
  const serverNow = Date.now();
  const state = await readSyncState(guard.userId, serverNow);

  // Tasks ride on the same pull, so they refresh on the same triggers as the timer.
  // ?tasksSince=0 asks for everything; a later value asks only for what changed since then.
  // Without the parameter the response is exactly what it was before tasks existed.
  const raw = new URL(request.url).searchParams.get("tasksSince");
  if (raw === null) return Response.json(state);
  const since = Number(raw);
  if (!Number.isFinite(since) || since < 0) return Response.json({ error: "invalid" }, { status: 400 });
  const tasks = await readTasksBlock(guard.userId, since, serverNow);
  return Response.json({ ...state, tasks });
}
