"use client";

import { useState, type CSSProperties } from "react";
import { Dialog } from "@/components/dialog";
import { useLocale, useTranslations } from "next-intl";
import { APP_NAME } from "@/config/brand";
import { formatClock } from "@/lib/format";
import { defaultTimer, displaySeconds, remainingMs, type Phase, type TimerCore } from "../logic";
import { requestNotificationPermission, unlockAudio } from "../notify";
import { useTimerStore } from "../store";
import { useTimerRuntime } from "../timer-runtime";
import { useTasksStore } from "@/features/tasks/store";
import { AmbientPlayer } from "@/features/ambient/ambient-player";
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
  // Display only; the server re-checks Pro on every settings write.
  const pro = useTasksStore((s) => s.pro);
  const locale = useLocale();
  const t = useTranslations("timer");
  const nav = useTranslations("nav");
  const stored = useTimerStore();
  const { ready, now, sync, refresh } = useTimerRuntime();
  const timer = ready ? stored : defaultTimer;
  const clockNow = ready ? now : 0;
  // What waits on the skip prompt: the skip button, or a phase tab.
  const [pending, setPending] = useState<{ type: "skip" } | { type: "select"; phase: Phase } | null>(null);
  const sessionLabel = (state: TimerCore) => {
    const total = state.longBreakEvery;
    const current =
      state.phase === "focus"
        ? Math.min(state.cycleIndex + 1, total)
        : Math.min(state.cycleIndex, total);
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

      <div className="mt-3 flex flex-col md:mt-6 md:grid md:grid-cols-[1.6fr_1fr] md:grid-rows-[auto_auto_auto_1fr] md:items-start md:gap-6">
        <section className="flex flex-col md:col-start-1 md:row-span-4 md:row-start-1 md:min-w-0 md:items-center md:gap-6 md:rounded-feature md:border md:border-line md:bg-surface md:p-8">
          <div className="mt-3 w-full md:mt-0 md:max-w-[460px]">
            <PhaseTabs
              phase={timer.phase}
              onSelect={(phase) => {
                if (phase === timer.phase) return;
                setPending({ type: "select", phase });
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
              onSkip={() => setPending({ type: "skip" })}
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

        <div className="hidden min-w-0 md:col-start-2 md:block">
          <TodayPanel />
        </div>
        <div className="hidden min-w-0 md:col-start-2 md:block">
          <TaskList />
        </div>
        <div className="mt-4 md:col-start-2 md:mt-0">
          <AmbientPlayer pro={pro} />
        </div>
      </div>
      <div className="flex-1 md:hidden" />
      <Dialog open={pending !== null} onClose={() => setPending(null)} title={t("skipConfirm.title")}>
        <p className="text-sm text-muted">
          {timer.phase === "focus" ? t("skipConfirm.focus") : t("skipConfirm.break")}
        </p>
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setPending(null)}
            className="min-h-11 cursor-pointer rounded-pill border border-line-strong bg-transparent px-4 text-sm font-semibold text-ink"
          >
            {t("skipConfirm.cancel")}
          </button>
          <button
            type="button"
            onClick={() => {
              const action = pending;
              setPending(null);
              if (!action) return;
              act(() => {
                const state = useTimerStore.getState();
                if (action.type === "skip") state.skip();
                else state.selectPhase(action.phase);
              });
            }}
            className="min-h-11 cursor-pointer rounded-pill border-0 bg-[var(--phase)] px-4 text-sm font-semibold text-white"
          >
            {t("skipConfirm.confirm")}
          </button>
        </div>
      </Dialog>
    </div>
  );
}
