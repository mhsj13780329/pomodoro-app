"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useTimerStore } from "@/features/timer/store";
import { authClient } from "@/lib/auth-client";
import { subscribeSync, syncView, type SyncView } from "@/lib/sync/status";
import { countCompletedFocus, pomodoroCounts } from "@/lib/tasks/counts";
import { FREE_ACTIVE_LIMIT } from "@/lib/tasks/contract";
import type { ProjectWire, TagWire } from "@/lib/tasks/contract";
import { activeTasks, doneTasks, pickableTask } from "@/lib/tasks/select";
import { useTasksStore } from "./store";

const GUEST_VIEW: SyncView = { kind: "guest" };

const byCreated = (a: { createdAt: string }, b: { createdAt: string }) => Date.parse(a.createdAt) - Date.parse(b.createdAt);

/**
 * Everything the task screens need, in one place: the lists, the derived pomodoro counts,
 * whether the account is Pro, and whether it is still loading. Components stay presentational.
 */
export function useTasksView() {
  const session = authClient.useSession();
  const signedIn = Boolean(session.data?.user);
  const sync = useSyncExternalStore(subscribeSync, syncView, () => GUEST_VIEW);

  const tasks = useTasksStore((state) => state.tasks);
  const serverCounts = useTasksStore((state) => state.counts);
  const pendingSessions = useTasksStore((state) => state.pendingSessions);
  const pro = useTasksStore((state) => state.pro);
  const projectRows = useTasksStore((state) => state.projects);
  const tagRows = useTasksStore((state) => state.tags);
  const hydrated = useTasksStore((state) => state.hydrated);
  const loaded = useTasksStore((state) => state.loaded);
  const guestSessions = useTimerStore((state) => state.completedSessions);
  const pickedId = useTimerStore((state) => state.taskId);

  const active = useMemo(() => activeTasks(tasks), [tasks]);
  const done = useMemo(() => doneTasks(tasks), [tasks]);
  const counts = useMemo(
    // A guest counts the sessions saved on this device. A signed-in user counts what the server
    // has plus the focus sessions still waiting to upload.
    () => (signedIn ? pomodoroCounts(serverCounts, pendingSessions) : countCompletedFocus(guestSessions)),
    [signedIn, serverCounts, pendingSessions, guestSessions],
  );
  const current = useMemo(() => pickableTask(tasks, pickedId), [tasks, pickedId]);

  const projects = useMemo<ProjectWire[]>(() => Object.values(projectRows).sort(byCreated), [projectRows]);
  const tags = useMemo<TagWire[]>(() => Object.values(tagRows).sort(byCreated), [tagRows]);
  // "2 of 3 subtasks" per parent task.
  const subtaskStats = useMemo(() => {
    const stats: Record<string, { done: number; total: number }> = {};
    for (const task of Object.values(tasks)) {
      if (task.parentId == null) continue;
      const entry = (stats[task.parentId] ??= { done: 0, total: 0 });
      entry.total += 1;
      if (task.done) entry.done += 1;
    }
    return stats;
  }, [tasks]);

  const hasRows = Object.keys(tasks).length > 0;
  // Show the skeleton instead of a wrong "empty" while the saved rows, the session or the first pull are pending.
  const ready = hydrated && !session.isPending && (!signedIn || loaded || hasRows);

  return {
    ready,
    signedIn,
    offline: sync.kind === "offline",
    pro,
    projects,
    tags,
    subtaskStats,
    active,
    done,
    counts,
    current,
    limit: FREE_ACTIVE_LIMIT,
    atLimit: !pro && active.length >= FREE_ACTIVE_LIMIT,
  };
}
