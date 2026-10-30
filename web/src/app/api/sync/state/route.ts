import { guardSync } from "@/lib/sync/http";
import { readSyncState } from "@/lib/sync/rows";

export async function GET() {
  const guard = await guardSync();
  if (guard instanceof Response) return guard;
  // One clock reading for the whole response. The client derives its offset from it.
  const serverNow = Date.now();
  const state = await readSyncState(guard.userId, serverNow);
  return Response.json(state);
}
