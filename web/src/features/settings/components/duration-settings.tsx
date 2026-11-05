"use client";

import { useTranslations } from "next-intl";
import { defaultTimer, type Phase } from "@/features/timer/logic";
import { useTimerStore } from "@/features/timer/store";
import { useTimerRuntime } from "@/features/timer/timer-runtime";
import { Link } from "@/i18n/navigation";
import { presetOf, TIMER_PRESETS } from "@/lib/settings/catalog";

const PRESET_LABEL = { classic: "presetClassic", long: "presetLong" } as const;

function minutes(sec: number): number {
  return Math.max(1, Math.round(sec / 60));
}

function MinusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="text-ink">
      <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="text-ink">
      <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function DurationSettings({ pro = false }: { pro?: boolean }) {
  const t = useTranslations("settings.durations");
  const { ready } = useTimerRuntime();
  const stored = useTimerStore();
  const timer = ready ? stored : defaultTimer;
  const focus = minutes(timer.focusSec);
  const short = minutes(timer.shortBreakSec);
  const long = minutes(timer.longBreakSec);
  const every = timer.longBreakEvery;
  const activePreset = presetOf({
    focusMin: focus,
    shortBreakMin: short,
    longBreakMin: long,
    longBreakEvery: every,
  });
  const isCustom = activePreset === null;
  // A free account can keep custom lengths it already has (read-only) but not change them.
  const showSteppers = pro || isCustom;
  const locked = !pro;

  const changePhase = (phase: Phase, current: number, delta: number) => {
    if (!ready) return;
    const next = Math.min(24 * 60, Math.max(1, current + delta));
    if (next === current) return;
    useTimerStore.getState().setPhaseSeconds(phase, next * 60);
  };

  const changeEvery = (delta: number) => {
    if (!ready) return;
    const next = Math.min(20, Math.max(1, every + delta));
    if (next === every) return;
    useTimerStore.getState().setLongBreakEvery(next);
  };

  return (
    <section className="mt-3 rounded-card border border-line bg-surface p-3.5">
      <h2 className="mb-1.5 text-base font-semibold">{t("title")}</h2>
      <div className="mb-1.5 flex flex-wrap gap-2" role="group" aria-label={t("presets")}>
        {TIMER_PRESETS.map((preset) => {
          const selected = activePreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                if (!ready) return;
                const store = useTimerStore.getState();
                store.setDurations(preset.focusMin, preset.shortBreakMin, preset.longBreakMin);
                store.setLongBreakEvery(preset.longBreakEvery);
              }}
              className={`min-h-11 cursor-pointer rounded-pill px-3.5 text-[13px] font-semibold ${
                selected ? "bg-focus text-white" : "border border-line-strong bg-transparent text-ink"
              }`}
            >
              {t(PRESET_LABEL[preset.id])}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={isCustom}
          disabled={locked}
          className={`min-h-11 rounded-pill px-3.5 text-[13px] font-semibold disabled:opacity-60 ${
            isCustom ? "bg-focus text-white" : "border border-line-strong bg-transparent text-ink"
          }`}
        >
          {t("custom")}
        </button>
      </div>
      {locked ? (
        <p className="mb-1.5 text-[13px] text-muted">
          <Link href="/pricing" className="underline">
            {t("customPro")}
          </Link>
        </p>
      ) : null}
      {showSteppers ? (
        <>
      <Stepper
        label={t("focus")}
        value={t("minutes", { count: focus })}
        decreaseLabel={t("decrease", { label: t("focus") })}
        increaseLabel={t("increase", { label: t("focus") })}
        onDecrease={() => changePhase("focus", focus, -1)}
        onIncrease={() => changePhase("focus", focus, 1)}
        decreaseDisabled={focus <= 1 || locked}
        increaseDisabled={focus >= 24 * 60 || locked}
      />
      <Stepper
        label={t("short")}
        value={t("minutes", { count: short })}
        decreaseLabel={t("decrease", { label: t("short") })}
        increaseLabel={t("increase", { label: t("short") })}
        onDecrease={() => changePhase("shortBreak", short, -1)}
        onIncrease={() => changePhase("shortBreak", short, 1)}
        decreaseDisabled={short <= 1 || locked}
        increaseDisabled={short >= 24 * 60 || locked}
      />
      <Stepper
        label={t("long")}
        value={t("minutes", { count: long })}
        decreaseLabel={t("decrease", { label: t("long") })}
        increaseLabel={t("increase", { label: t("long") })}
        onDecrease={() => changePhase("longBreak", long, -1)}
        onIncrease={() => changePhase("longBreak", long, 1)}
        decreaseDisabled={long <= 1 || locked}
        increaseDisabled={long >= 24 * 60 || locked}
      />
      <Stepper
        label={t("every")}
        value={t("sessions", { count: every })}
        decreaseLabel={t("decrease", { label: t("every") })}
        increaseLabel={t("increase", { label: t("every") })}
        onDecrease={() => changeEvery(-1)}
        onIncrease={() => changeEvery(1)}
        decreaseDisabled={every <= 1 || locked}
        increaseDisabled={every >= 20 || locked}
      />
        </>
      ) : null}
    </section>
  );
}

function Stepper(props: {
  label: string;
  value: string;
  decreaseLabel: string;
  increaseLabel: string;
  onDecrease: () => void;
  onIncrease: () => void;
  decreaseDisabled: boolean;
  increaseDisabled: boolean;
}) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-3 border-t border-line">
      <span className="text-[15px]">{props.label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={props.decreaseLabel}
          disabled={props.decreaseDisabled}
          onClick={props.onDecrease}
          className="flex size-11 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-transparent disabled:cursor-default disabled:opacity-40"
        >
          <MinusIcon />
        </button>
        <span className="min-w-[76px] text-center text-[15px] font-semibold">{props.value}</span>
        <button
          type="button"
          aria-label={props.increaseLabel}
          disabled={props.increaseDisabled}
          onClick={props.onIncrease}
          className="flex size-11 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-transparent disabled:cursor-default disabled:opacity-40"
        >
          <PlusIcon />
        </button>
      </div>
    </div>
  );
}
