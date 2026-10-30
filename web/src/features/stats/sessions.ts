import type { StatSession } from "@/lib/stats/aggregate";

/** Queue rows and guest rows both become the session shape the stats math expects. */
export function toStatSession(session: {
  id: string;
  startedAt: number | string;
  endedAt: number | string;
  durationSec: number;
  phase?: string;
  completed?: boolean;
  taskId?: string | null;
  projectId?: string | null;
}): StatSession {
  return {
    id: session.id,
    startedAt: typeof session.startedAt === "number" ? session.startedAt : Date.parse(session.startedAt),
    endedAt: typeof session.endedAt === "number" ? session.endedAt : Date.parse(session.endedAt),
    durationSec: session.durationSec,
    phase: session.phase ?? "focus",
    completed: session.completed ?? true,
    taskId: session.taskId ?? null,
    projectId: session.projectId ?? null,
  };
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tehran";
  } catch {
    return "Asia/Tehran";
  }
}
