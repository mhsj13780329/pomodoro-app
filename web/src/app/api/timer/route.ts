import { timerCommandSchema } from "@/lib/sync/contract";
import { guardSync, readJson } from "@/lib/sync/http";
import { writeTimer } from "@/lib/sync/rows";

export async function POST(request: Request) {
  const guard = await guardSync();
  if (guard instanceof Response) return guard;

  const json = await readJson(request);
  if (json instanceof Response) return json;
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
