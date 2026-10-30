import { getTranslations } from "next-intl/server";
import { guardSync } from "@/lib/sync/http";
import type { CsvLabels } from "@/lib/stats/csv";
import { sessionsToCsv } from "@/lib/stats/csv";
import { readStats } from "@/lib/stats/query";

/** Pro-only download of the same sessions the stats page is showing. */
export async function GET(request: Request) {
  const guard = await guardSync();
  if (guard instanceof Response) return guard;

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!from || !to) return Response.json({ error: "invalid" }, { status: 400 });

  const read = await readStats(guard.userId, {
    from,
    to,
    breakdown: false,
    export: true,
    locale: url.searchParams.get("locale"),
    now: Date.now(),
  });
  if (!read.ok) return Response.json({ error: read.error }, { status: read.status });

  const t = await getTranslations({ locale: read.locale, namespace: "stats" });
  const labels: CsvLabels = {
    date: t("csv.date"),
    start: t("csv.start"),
    end: t("csv.end"),
    minutes: t("csv.minutes"),
    task: t("csv.task"),
    project: t("csv.project"),
    noTask: t("csv.noTask"),
    noProject: t("csv.noProject"),
    deleted: t("csv.deleted"),
  };
  const csv = sessionsToCsv(read.sessions, labels, read.locale, read.timezone);
  const filename = `focus-${read.from}-${read.to}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
