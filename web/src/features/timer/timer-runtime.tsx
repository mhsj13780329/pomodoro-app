"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { APP_NAME } from "@/config/brand";
import { formatClock } from "@/lib/format";
import { syncIsActive, syncNow } from "@/lib/sync/engine";
import { displaySeconds, type TimerCore } from "./logic";
import { notifyPhase, playChime } from "./notify";
import { useTimerStore } from "./store";

type Runtime = {
  ready: boolean;
  now: number;
  /** Move the schedule to the real clock. True when a phase ended. */
  sync: () => boolean;
  refresh: () => void;
};

const TimerRuntimeContext = createContext<Runtime | null>(null);

export function TimerRuntime({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const t = useTranslations("timer");
  const phases = useTranslations("timer.phases");
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(0);

  const titleFor = useMemo(() => {
    return (state: TimerCore, stamp: number) => {
      if (state.status !== "running") return APP_NAME;
      return `${formatClock(displaySeconds(state, stamp), locale)} — ${phases(state.phase)}`;
    };
  }, [locale, phases]);

  const chimeFor = useMemo(() => {
    return (state: TimerCore) => {
      playChime();
      const name = phases(state.phase);
      const body = state.status === "running" ? t("started") : t("ready");
      notifyPhase(name, body);
    };
  }, [phases, t]);

  const sync = useMemo(() => {
    return () => {
      // Signed-in devices ask the server to advance one phase. Guests still
      // reconstruct locally, because they have no server to ask.
      if (syncIsActive()) {
        const stamp = syncNow();
        const ended = useTimerStore.getState().completeIfDue(stamp);
        const state = useTimerStore.getState();
        if (ended) chimeFor(state);
        setNow(stamp);
        document.title = titleFor(state, stamp);
        return ended;
      }
      const ended = useTimerStore.getState().catchUp(Date.now());
      const stamp = Date.now();
      if (ended) chimeFor(useTimerStore.getState());
      setNow(stamp);
      document.title = titleFor(useTimerStore.getState(), stamp);
      return ended;
    };
  }, [chimeFor, titleFor]);

  const refresh = useMemo(() => {
    return () => {
      const stamp = syncIsActive() ? syncNow() : Date.now();
      setNow(stamp);
      document.title = titleFor(useTimerStore.getState(), stamp);
    };
  }, [titleFor]);

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
      document.title = APP_NAME;
    };
  }, [sync]);

  const value = useMemo(() => ({ ready, now, sync, refresh }), [ready, now, sync, refresh]);

  return <TimerRuntimeContext.Provider value={value}>{children}</TimerRuntimeContext.Provider>;
}

export function useTimerRuntime(): Runtime {
  const value = useContext(TimerRuntimeContext);
  if (!value) throw new Error("useTimerRuntime must be used inside TimerRuntime");
  return value;
}
