"use client";

import type { CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { APP_NAME } from "@/config/brand";
import { formatClock } from "@/lib/format";
import { defaultTimer, displaySeconds, remainingMs, type Phase, type TimerCore } from "../logic";
import { requestNotificationPermission, unlockAudio } from "../notify";
import { useTimerStore } from "../store";
import { useTimerRuntime } from "../timer-runtime";
import { AutoStartSwitches } from "./auto-start-switches";
import { CycleDots } from "./cycle-dots";
import { PhaseTabs } from "./phase-tabs";
import { StreakChip } from "./streak-chip";
import { TaskChip } from "./task-chip";
import { TaskList } from "./task-list";
import { TimerControls } from "./timer-controls";
import { TimerRing } from "./timer-ring";
import { TodayPanel } from "./today-panel";
import { IconLogo } from "@/components/icons";

const phaseColor: Record<Phase, string> = {
  focus: "var(--focus)",
  shortBreak: "var(--short)",
  longBreak: "var(--long)",
};

export function TimerScreen() {
  const locale = useLocale();
  const t = useTranslations("timer");
  const nav = useTranslations("nav");
  const stored = useTimerStore();
  const { ready, now, sync, refresh } = useTimerRuntime();
  const timer = ready ? stored : defaultTimer;
  const clockNow = ready ? now : 0;
  const sessionLabel = (state: TimerCore) => {
    const total = state.longBreakEvery;
    const current =
      state.phase === "focus"
        ? Math.min(state.completedFocusInCycle + 1, total)
        : Math.min(state.completedFocusInCycle, total);
    return t("session", { current, total });
  };

  const subtitle = (state: TimerCore) => {
    if (state.phase === "shortBreak") return t("shortHint");
    if (state.phase === "longBreak") return t("longHint");
    return sessionLabel(state);
  };

  const seconds = displaySeconds(timer, clockNow);
  const plannedMs = Math.round(timer.plannedSec * 1000);
  const leftMs = remainingMs(timer, clockNow);
  const progress = plannedMs <= 0 ? 0 : 1 - leftMs / plannedMs;

  const act = (fn: () => void) => {
    if (!ready) return;
    if (sync()) return;
    fn();
    refresh();
  };

  const onToggle = () => {
    act(() => {
      const state = useTimerStore.getState();
      if (state.status === "idle") {
        unlockAudio();
        requestNotificationPermission();
        state.start(Date.now());
        return;
      }
      if (state.status === "running") state.pause(Date.now());
      else state.resume(Date.now());
    });
  };

  return (
    <div
      className="flex flex-1 flex-col"
      style={{ "--phase": phaseColor[timer.phase] } as CSSProperties}
    >
      <div className="flex min-h-11 items-center justify-between md:hidden">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-full bg-focus text-white">
            <IconLogo className="size-[18px]" />
          </span>
          <span className="text-lg font-bold">{APP_NAME}</span>
        </div>
        <StreakChip />
      </div>

      <div className="hidden items-center justify-between gap-3 md:flex">
        <h1 className="text-[26px] font-bold">{nav("timer")}</h1>
        <StreakChip />
      </div>

      <div className="mt-3 flex flex-col md:mt-6 md:flex-row md:items-start md:gap-6">
        <section className="flex flex-col md:min-w-0 md:flex-[1.6] md:items-center md:gap-6 md:rounded-feature md:border md:border-line md:bg-surface md:p-8">
          <div className="mt-3 w-full md:mt-0 md:max-w-[460px]">
            <PhaseTabs
              phase={timer.phase}
              onSelect={(phase) => {
                if (phase === timer.phase) return;
                act(() => useTimerStore.getState().selectPhase(phase));
              }}
            />
          </div>
          <div className="mt-4 md:mt-0">
            <TimerRing progress={progress} clock={formatClock(seconds, locale)} subtitle={subtitle(timer)} />
          </div>
          <div className="mt-3.5 md:hidden">
            <TaskChip />
          </div>
          <div className="mt-4 md:mt-0">
            <TimerControls
              running={timer.status === "running"}
              onToggle={onToggle}
              onReset={() => act(() => useTimerStore.getState().reset())}
              onSkip={() => act(() => useTimerStore.getState().skip())}
            />
          </div>
          <div className="mt-3.5 md:mt-0">
            <CycleDots state={timer} label={sessionLabel(timer)} />
          </div>
          <div className="mt-3.5 w-full md:mt-0 md:max-w-[460px]">
            <AutoStartSwitches
              checked={{
                focus: timer.autoStartFocus,
                shortBreak: timer.autoStartShortBreak,
                longBreak: timer.autoStartLongBreak,
              }}
              onToggle={(phase) => {
                if (!ready) return;
                sync();
                useTimerStore.getState().toggleAutoStart(phase);
              }}
            />
          </div>
        </section>

        <div className="hidden min-w-0 flex-1 flex-col gap-6 md:flex">
          <TodayPanel />
          <TaskList />
        </div>
      </div>
      <div className="flex-1 md:hidden" />
    </div>
  );
}
