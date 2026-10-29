"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { formatClock, phaseLabel } from "./format";
import { displaySeconds, type TimerCore } from "./logic";
import { notifyPhase, playChime } from "./notify";
import { useTimerStore } from "./store";
import { strings } from "./strings.fa";

type Runtime = {
  ready: boolean;
  now: number;
  /** Move the schedule to the real clock. True when a phase ended. */
  sync: () => boolean;
  refresh: () => void;
};

const TimerRuntimeContext = createContext<Runtime | null>(null);

function titleFor(state: TimerCore, now: number): string {
  if (state.status !== "running") return strings.appName;
  return `${formatClock(displaySeconds(state, now))} — ${phaseLabel(state.phase)}`;
}

function chimeFor(state: TimerCore): void {
  playChime();
  const name = phaseLabel(state.phase);
  const body = state.status === "running" ? strings.started : strings.ready;
  notifyPhase(name, body);
}

export function TimerRuntime({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(0);

  const sync = useMemo(() => {
    return () => {
      const ended = useTimerStore.getState().catchUp(Date.now());
      const stamp = Date.now();
      if (ended) chimeFor(useTimerStore.getState());
      setNow(stamp);
      document.title = titleFor(useTimerStore.getState(), stamp);
      return ended;
    };
  }, []);

  const refresh = useMemo(() => {
    return () => {
      const stamp = Date.now();
      setNow(stamp);
      document.title = titleFor(useTimerStore.getState(), stamp);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalId = 0;
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };

    void (async () => {
      await useTimerStore.persist.rehydrate();
      if (cancelled) return;
      sync();
      setReady(true);
      // Repaint only. Remaining time is always Date.now() minus the stored timestamps.
      // A background tab slows this interval down; the next tick still catches the real phase.
      intervalId = window.setInterval(sync, 250);
      document.addEventListener("visibilitychange", onVisible);
    })();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      document.title = strings.appName;
    };
  }, [sync]);

  const value = useMemo(
    () => ({ ready, now, sync, refresh }),
    [ready, now, sync, refresh],
  );

  return <TimerRuntimeContext.Provider value={value}>{children}</TimerRuntimeContext.Provider>;
}

export function useTimerRuntime(): Runtime {
  const value = useContext(TimerRuntimeContext);
  if (!value) throw new Error("useTimerRuntime must be used inside TimerRuntime");
  return value;
}
