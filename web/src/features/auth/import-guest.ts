import { parseTheme, THEME_COOKIE } from "@/features/settings/theme";
import { guestTasksSnapshot, hydrateTasks } from "@/features/tasks/store";
import { guestImportSnapshot, useTimerStore } from "@/features/timer/store";
import type { ImportBody, ImportSettings } from "@/lib/import/contract";

function themeFromCookie(): ImportSettings["themeId"] {
  const match = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`));
  const raw = match ? decodeURIComponent(match[1] ?? "") : null;
  return parseTheme(raw);
}

/**
 * Both stores use skipHydration, so their saved data (already migrated) is only in memory after a rehydrate.
 * The timer is normally rehydrated by TimerRuntime; the login page has no TimerRuntime.
 */
async function loadStores(): Promise<void> {
  await hydrateTasks();
  if (!useTimerStore.persist.hasHydrated()) await useTimerStore.persist.rehydrate();
}

async function readGuestImport(): Promise<ImportBody> {
  await loadStores();
  return { ...guestImportSnapshot(themeFromCookie()), tasks: guestTasksSnapshot() };
}

/**
 * Uploads this browser's guest data once per account. A failed request stays unmarked so the next login retries.
 * Guest tasks are the exception to "once": a guest can sign in, sign out, make more tasks and sign in again,
 * so the flag only skips the upload when there are no unclaimed guest tasks left.
 */
export async function importGuestData(userId: string): Promise<boolean> {
  const flag = `pomodoro-imported:${userId}`;
  await loadStores();
  if (localStorage.getItem(flag) && guestTasksSnapshot().length === 0) return true;
  const response = await fetch("/api/import", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(await readGuestImport()),
  });
  if (!response.ok) return false;
  localStorage.setItem(flag, "1");
  return true;
}
