import { importGuest } from "@/lib/import/import";
import { importBodySchema } from "@/lib/import/contract";
import { guardSync, readJson } from "@/lib/sync/http";

export async function POST(request: Request) {
  const guard = await guardSync();
  if (guard instanceof Response) return guard;

  const json = await readJson(request);
  if (json instanceof Response) return json;
  const parsed = importBodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  return Response.json(await importGuest(guard.userId, parsed.data, Date.now()));
}
