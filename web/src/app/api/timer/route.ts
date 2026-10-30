import { setTaskCommandSchema, timerCommandSchema } from "@/lib/sync/contract";
import { guardSync, readJson } from "@/lib/sync/http";
import { readSyncState, writeTimer } from "@/lib/sync/rows";
import { selectTask } from "@/lib/tasks/rows";

export async function POST(request: Request) {
  const guard = await guardSync();
  if (guard instanceof Response) return guard;

  const json = await readJson(request);
  if (json instanceof Response) return json;

  // Choosing a task is not a countdown change, so it has no expectedVersion and cannot 409.
  const pick = setTaskCommandSchema.safeParse(json);
  if (pick.success) {
    await readSyncState(guard.userId, Date.now()); // makes sure the timer row exists
    await selectTask(guard.userId, pick.data.taskId);
    return Response.json(await readSyncState(guard.userId, Date.now()));
  }

  const parsed = timerCommandSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  const serverNow = Date.now();
  const result = await writeTimer(guard.userId, parsed.data, serverNow);
  if (result.kind === "conflict") return Response.json(result.state, { status: 409 });
  if (result.kind === "early") {
    return Response.json({ error: "too_early", ...result.state }, { status: 422 });
  }
  return Response.json(result.state);
}
