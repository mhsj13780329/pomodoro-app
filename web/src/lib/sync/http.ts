import "server-only";
import { getCurrentUser } from "@/lib/current-user";
import { allowSyncRequest } from "@/lib/rate-limit";

/** Session cookie, then the per-user sync cap. A guest is rejected before any read. */
export async function guardSync(): Promise<{ userId: string } | Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const allowed = await allowSyncRequest(user.id);
  if (!allowed) return Response.json({ error: "rate_limited" }, { status: 429 });
  return { userId: user.id };
}

export async function readJson(request: Request): Promise<unknown | Response> {
  try {
    return await request.json();
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
}
