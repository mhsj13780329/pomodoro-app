import { guardSync } from "@/lib/sync/http";
import { readStats, toStatsResponse } from "@/lib/stats/query";

/**
 * Focus stats for the signed-in user.
 * A free account may ask for the last 7 local days and the current month.
 * Older ranges, the per-task breakdown, and CSV export are refused with requirePro().
 */
export async function GET(request: Request) {
  const guard = await guardSync();
  if (guard instanceof Response) return guard;

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const breakdownParam = url.searchParams.get("breakdown");
  if (!from || !to) return Response.json({ error: "invalid" }, { status: 400 });
  if (breakdownParam != null && breakdownParam !== "1") {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  const read = await readStats(guard.userId, {
    from,
    to,
    breakdown: breakdownParam === "1",
    export: false,
    locale: url.searchParams.get("locale"),
    now: Date.now(),
  });
  if (!read.ok) return Response.json({ error: read.error }, { status: read.status });
  return Response.json(toStatsResponse(read, breakdownParam === "1"));
}
