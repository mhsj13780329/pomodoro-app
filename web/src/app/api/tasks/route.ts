import { guardSync, readJson } from "@/lib/sync/http";
import { taskBatchSchema } from "@/lib/tasks/contract";
import { applyTaskBatch } from "@/lib/tasks/rows";

/**
 * Applies the task, project and tag writes a device queued while it was offline (or just now).
 * The answer lists what happened to each item, so the device can adopt the server's version
 * of anything that lost, without showing an error.
 */
export async function POST(request: Request) {
  const guard = await guardSync();
  if (guard instanceof Response) return guard;

  const json = await readJson(request);
  if (json instanceof Response) return json;
  const parsed = taskBatchSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  const result = await applyTaskBatch(guard.userId, parsed.data, Date.now());
  return Response.json(result);
}
