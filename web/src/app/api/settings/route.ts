import { settingsPatchSchema } from "@/lib/sync/contract";
import { guardSync, readJson } from "@/lib/sync/http";
import { writeSettings } from "@/lib/sync/rows";

export async function PUT(request: Request) {
  const guard = await guardSync();
  if (guard instanceof Response) return guard;

  const json = await readJson(request);
  if (json instanceof Response) return json;
  const parsed = settingsPatchSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  const serverNow = Date.now();
  const state = await writeSettings(guard.userId, parsed.data, serverNow);
  return Response.json(state);
}
