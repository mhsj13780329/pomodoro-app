"use client";

import { useEffect } from "react";
import { importGuestData } from "@/features/auth/import-guest";
import { currentTheme } from "@/features/settings/theme";
import { hydrateTasks, useTasksStore } from "@/features/tasks/store";
import { useTimerStore } from "@/features/timer/store";
import { authClient } from "@/lib/auth-client";
import { startSync, type SettingsSnapshot, type SyncHost } from "@/lib/sync/engine";

function clampMinute(sec: number): number {
  return Math.min(24 * 60, Math.max(1, Math.round(sec / 60)));
}

function snapshot(): SettingsSnapshot {
  const state = useTimerStore.getState();
  return {
    settingsUpdatedAt: state.settingsUpdatedAt,
    focusMin: clampMinute(state.focusSec),
    shortBreakMin: clampMinute(state.shortBreakSec),
    longBreakMin: clampMinute(state.longBreakSec),
    longBreakEvery: state.longBreakEvery,
    autoStartFocus: state.autoStartFocus,
    autoStartShortBreak: state.autoStartShortBreak,
    autoStartLongBreak: state.autoStartLongBreak,
    themeId: currentTheme(),
  };
}

/** The sync engine talks to the stores only through this object. */
const host: SyncHost = {
  snapshot,
  adopt: (state, options) => useTimerStore.getState().adoptServer(state, options),
  tasks: {
    since: () => useTasksStore.getState().since(),
    adopt: (block) => useTasksStore.getState().adoptBlock(block),
    settle: (sent, result) => useTasksStore.getState().settle(sent, result),
    setPending: (queue) => useTasksStore.getState().setPending(queue),
    sessionsChanged: (waiting, uploaded) => useTasksStore.getState().sessionsChanged(waiting, uploaded),
  },
};

/** Loads saved tasks, uploads guest data once, then starts sync. A guest never reaches startSync. */
export function SyncRoot() {
  const { data, isPending } = authClient.useSession();
  const userId = data?.user.id;

  // Guests need their saved tasks too, so this does not wait for a session.
  useEffect(() => {
    void hydrateTasks();
  }, []);

  useEffect(() => {
    if (isPending || !userId) return;
    let stop = () => {};
    let cancelled = false;
    void (async () => {
      await hydrateTasks();
      const imported = await importGuestData(userId);
      if (cancelled) return;
      useTasksStore.getState().claim(userId, imported);
      stop = startSync(userId, host);
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [isPending, userId]);

  return null;
}
