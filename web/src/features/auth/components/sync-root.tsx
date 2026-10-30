"use client";

import { useEffect } from "react";
import { importGuestData } from "@/features/auth/import-guest";
import { currentTheme } from "@/features/settings/theme";
import { useTimerStore } from "@/features/timer/store";
import { authClient } from "@/lib/auth-client";
import { startSync, type SettingsSnapshot } from "@/lib/sync/engine";

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

/** Uploads guest data once, then starts sync. A guest never reaches startSync. */
export function SyncRoot() {
  const { data, isPending } = authClient.useSession();
  const userId = data?.user.id;

  useEffect(() => {
    if (isPending || !userId) return;
    let stop = () => {};
    let cancelled = false;
    void (async () => {
      await importGuestData(userId);
      if (cancelled) return;
      stop = startSync(userId, {
        snapshot,
        adopt: (state, options) => useTimerStore.getState().adoptServer(state, options),
      });
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [isPending, userId]);

  return null;
}
