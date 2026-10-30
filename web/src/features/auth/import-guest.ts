import { defaultTimer } from "@/features/timer/logic";
import { parseTheme, THEME_COOKIE } from "@/features/settings/theme";
import type { ImportSettings } from "./import-merge";

const STORAGE_KEY = "pomodoro-timer";

type StoredSession = {
  id?: unknown;
  phase?: unknown;
  startedAt?: unknown;
  endedAt?: unknown;
  durationSec?: unknown;
  completed?: unknown;
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
      },
    ];
  });
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
  return { settings: readSettings(state), sessions: readSessions(sessions) };
}

/** Uploads this browser's guest data once per account. A failed request stays unmarked so the next login retries. */
export async function importGuestData(userId: string): Promise<boolean> {
  const flag = `pomodoro-imported:${userId}`;
  if (localStorage.getItem(flag)) return true;
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
