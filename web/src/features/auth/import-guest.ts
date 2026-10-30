import { defaultTimer } from "@/features/timer/logic";
import { parseTheme, THEME_COOKIE } from "@/features/settings/theme";
import type { ImportSettings, ImportTask } from "./import-merge";

const STORAGE_KEY = "pomodoro-timer";
const TASKS_KEY = "pomodoro-tasks";

type StoredSession = {
  id?: unknown;
  phase?: unknown;
  startedAt?: unknown;
  endedAt?: unknown;
  durationSec?: unknown;
  completed?: unknown;
  taskId?: unknown;
};

function minutes(value: unknown, fallbackSec: number): number {
  const sec = typeof value === "number" && Number.isFinite(value) ? value : fallbackSec;
  return Math.min(24 * 60, Math.max(1, Math.round(sec / 60)));
}

function themeFromCookie(): ImportSettings["themeId"] {
  const match = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`));
  const raw = match ? decodeURIComponent(match[1] ?? "") : null;
  return parseTheme(raw);
}

function readSettings(state: Record<string, unknown> | undefined): ImportSettings {
  return {
    focusMin: minutes(state?.focusSec, defaultTimer.focusSec),
    shortBreakMin: minutes(state?.shortBreakSec, defaultTimer.shortBreakSec),
    longBreakMin: minutes(state?.longBreakSec, defaultTimer.longBreakSec),
    longBreakEvery:
      typeof state?.longBreakEvery === "number" && state.longBreakEvery >= 1
        ? Math.min(20, Math.round(state.longBreakEvery))
        : defaultTimer.longBreakEvery,
    autoStartFocus: state?.autoStartFocus === true,
    autoStartShortBreak: state?.autoStartShortBreak !== false,
    autoStartLongBreak: state?.autoStartLongBreak !== false,
    themeId: themeFromCookie(),
  };
}

function readSessions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const session = item as StoredSession;
    if (typeof session.id !== "string") return [];
    if (typeof session.startedAt !== "number" || typeof session.endedAt !== "number") return [];
    if (!(session.endedAt > session.startedAt)) return [];
    if (typeof session.durationSec !== "number" || session.durationSec <= 0) return [];
    const phase =
      session.phase === "focus"
        ? "FOCUS"
        : session.phase === "shortBreak"
          ? "SHORT_BREAK"
          : session.phase === "longBreak"
            ? "LONG_BREAK"
            : null;
    if (!phase) return [];
    return [
      {
        id: session.id,
        phase,
        startedAt: new Date(session.startedAt).toISOString(),
        endedAt: new Date(session.endedAt).toISOString(),
        durationSec: Math.round(session.durationSec),
        completed: session.completed === true,
        taskId: typeof session.taskId === "string" ? session.taskId : null,
      },
    ];
  });
}

/**
 * Tasks made while signed out. They are still "guest" tasks while the saved ownerId is null:
 * once an account has taken them, the store records its id and they are not uploaded again.
 */
export function readGuestTasks(): ImportTask[] {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    if (!raw) return [];
    const state = (JSON.parse(raw) as { state?: { ownerId?: unknown; tasks?: Record<string, Record<string, unknown>> } }).state;
    if (!state || state.ownerId != null || !state.tasks) return [];
    const list = Object.values(state.tasks).flatMap((task) => {
      if (typeof task.id !== "string" || typeof task.title !== "string" || task.deletedAt != null) return [];
      if (task.parentId != null) return [];
      const updatedAt = typeof task.updatedAt === "string" ? task.updatedAt : new Date().toISOString();
      return [
        {
          id: task.id,
          title: task.title,
          done: task.done === true,
          doneAt: typeof task.doneAt === "string" ? task.doneAt : null,
          order: typeof task.order === "number" ? Math.round(task.order) : 0,
          createdAt: typeof task.createdAt === "string" ? task.createdAt : updatedAt,
          updatedAt,
        },
      ];
    });
    // The upload takes at most 500. Unfinished tasks matter most, then the newest finished ones.
    return list
      .sort((a, b) => Number(a.done) - Number(b.done) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, 500);
  } catch {
    return [];
  }
}

export function readGuestImport() {
  let state: Record<string, unknown> | undefined;
  let sessions: unknown;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
      state = parsed.state;
      sessions = parsed.state?.completedSessions;
    }
  } catch {
    state = undefined;
  }
  return { settings: readSettings(state), sessions: readSessions(sessions), tasks: readGuestTasks() };
}

/**
 * Uploads this browser's guest data once per account. A failed request stays unmarked so the next login retries.
 * Guest tasks are the exception to "once": a guest can sign in, sign out, make more tasks and sign in again,
 * so the flag only skips the upload when there are no unclaimed guest tasks left.
 */
export async function importGuestData(userId: string): Promise<boolean> {
  const flag = `pomodoro-imported:${userId}`;
  if (localStorage.getItem(flag) && readGuestTasks().length === 0) return true;
  const response = await fetch("/api/import", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(readGuestImport()),
  });
  if (!response.ok) return false;
  localStorage.setItem(flag, "1");
  return true;
}
