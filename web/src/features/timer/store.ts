import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { SessionInput, SyncState, TimerCommand } from "@/lib/sync/contract";
import { publishTimerCommand, settingsChanged, syncIsActive, syncNow } from "@/lib/sync/engine";
import { applyTheme } from "@/features/settings/theme";
import { remainingMs } from "@/lib/timer/remaining";
import { applyTimerAction, type PhaseSettings, type TransitionTimer } from "@/lib/timer/transitions";
import { finishedFocusSession, type GuestFocusSession } from "./sessions";
import {
  catchUp as catchUpCore,
  defaultTimer,
  pause as pauseCore,
  reset as resetCore,
  resume as resumeCore,
  selectPhase as selectPhaseCore,
  setLongBreakEvery as setEveryCore,
  setPhaseSeconds as setSecondsCore,
  skip as skipCore,
  start as startCore,
  toggleAutoStart as toggleCore,
  type Phase,
  type TimerCore,
} from "./logic";

type Actions = {
  start: (now: number) => void;
  pause: (now: number) => void;
  resume: (now: number) => void;
  reset: () => void;
  skip: () => void;
  selectPhase: (phase: Phase) => void;
  toggleAutoStart: (phase: Phase) => void;
  setPhaseSeconds: (phase: Phase, sec: number) => void;
  setDurations: (focusMin: number, shortMin: number, longMin: number) => void;
  setLongBreakEvery: (n: number) => void;
  /** True when a phase had already ended and the schedule moved on. Guests only. */
  catchUp: (now: number) => boolean;
  /** Signed-in: send complete once when the adjusted clock reaches zero. True if the chime should play. */
  completeIfDue: (now: number) => boolean;
  adoptServer: (state: SyncState, options: { timer: boolean; kind: "ok" | "conflict" | "early" | "pull" }) => void;
  resetGuest: () => void;
};

const MAX_GUEST_SESSIONS = 200;

type SyncFields = {
  version: number;
  runId: string;
  taskId: string | null;
  settingsUpdatedAt: number;
};

const syncDefaults: SyncFields = {
  version: 0,
  runId: "",
  taskId: null,
  settingsUpdatedAt: 0,
};

export type TimerStore = TimerCore &
  SyncFields &
  Actions & {
    completedSessions: GuestFocusSession[];
  };

let completingRunId: string | null = null;
let chimedRunId: string | null = null;

function toCore(state: TimerStore): TimerCore {
  return {
    phase: state.phase,
    status: state.status,
    startedAt: state.startedAt,
    plannedSec: state.plannedSec,
    pausedAt: state.pausedAt,
    pausedTotalSec: state.pausedTotalSec,
    completedFocusInCycle: state.completedFocusInCycle,
    focusSec: state.focusSec,
    shortBreakSec: state.shortBreakSec,
    longBreakSec: state.longBreakSec,
    longBreakEvery: state.longBreakEvery,
    autoStartFocus: state.autoStartFocus,
    autoStartShortBreak: state.autoStartShortBreak,
    autoStartLongBreak: state.autoStartLongBreak,
  };
}

function lengths(state: TimerStore): PhaseSettings {
  return {
    focusSec: state.focusSec,
    shortBreakSec: state.shortBreakSec,
    longBreakSec: state.longBreakSec,
    longBreakEvery: state.longBreakEvery,
    autoStartFocus: state.autoStartFocus,
    autoStartShortBreak: state.autoStartShortBreak,
    autoStartLongBreak: state.autoStartLongBreak,
  };
}

function toRow(state: TimerStore): TransitionTimer {
  return {
    phase: state.phase,
    status: state.status,
    startedAt: state.startedAt,
    plannedSec: state.plannedSec,
    pausedAt: state.pausedAt,
    pausedTotalSec: state.pausedTotalSec,
    cycleIndex: state.completedFocusInCycle,
    runId: state.runId,
    version: state.version,
    taskId: state.taskId,
  };
}

function stamp(): number {
  return syncIsActive() ? syncNow() : Date.now();
}

function noteSettings(patch: Partial<TimerStore>) {
  if (!syncIsActive()) return patch;
  return { ...patch, settingsUpdatedAt: syncNow() };
}

/** Theme picker and the duration steppers call this after a local settings edit. */
export function touchSyncedSettings() {
  if (!syncIsActive()) return;
  useTimerStore.setState({ settingsUpdatedAt: syncNow() });
  settingsChanged();
}

function commandFor(
  action: { type: "start"; runId: string } | { type: "pause" } | { type: "resume" } | { type: "skip" } | { type: "reset" } | { type: "select"; phase: Phase } | { type: "complete"; nextRunId: string },
  expectedVersion: number,
): TimerCommand {
  switch (action.type) {
    case "start":
      return { action: "start", expectedVersion, runId: action.runId };
    case "select":
      return { action: "select", expectedVersion, phase: action.phase };
    case "complete":
      return { action: "complete", expectedVersion, runId: action.nextRunId };
    case "pause":
    case "resume":
    case "skip":
    case "reset":
      return { action: action.type, expectedVersion };
  }
}

function sessionBody(before: TransitionTimer, session: NonNullable<ReturnType<typeof applyTimerAction>["session"]>): SessionInput {
  return {
    id: session.id,
    phase: "focus",
    startedAt: new Date(session.startedAt).toISOString(),
    endedAt: new Date(session.endedAt).toISOString(),
    durationSec: session.durationSec,
    plannedSec: Math.max(1, Math.round(before.plannedSec)),
    completed: true,
    taskId: session.taskId,
  };
}

export const useTimerStore = create<TimerStore>()(
  persist(
    (set, get) => ({
      ...defaultTimer,
      ...syncDefaults,
      completedSessions: [],
      start: (now) => {
        const state = get();
        const at = syncIsActive() ? syncNow() : now;
        if (!syncIsActive()) {
          set(startCore(toCore(state), at));
          return;
        }
        const runId = crypto.randomUUID();
        const before = toRow(state);
        const step = applyTimerAction(before, lengths(state), { type: "start", runId }, at);
        if (!step.changed) return;
        set(fieldsOf(step.timer));
        publishTimerCommand({ command: commandFor({ type: "start", runId }, state.version), session: null });
      },
      pause: (now) => {
        const state = get();
        const at = syncIsActive() ? syncNow() : now;
        if (!syncIsActive()) {
          set(pauseCore(toCore(state), at));
          return;
        }
        const step = applyTimerAction(toRow(state), lengths(state), { type: "pause" }, at);
        if (!step.changed) return;
        set(fieldsOf(step.timer));
        publishTimerCommand({ command: commandFor({ type: "pause" }, state.version), session: null });
      },
      resume: (now) => {
        const state = get();
        const at = syncIsActive() ? syncNow() : now;
        if (!syncIsActive()) {
          set(resumeCore(toCore(state), at));
          return;
        }
        const step = applyTimerAction(toRow(state), lengths(state), { type: "resume" }, at);
        if (!step.changed) return;
        set(fieldsOf(step.timer));
        publishTimerCommand({ command: commandFor({ type: "resume" }, state.version), session: null });
      },
      reset: () => {
        const state = get();
        if (!syncIsActive()) {
          set(resetCore(toCore(state)));
          return;
        }
        const step = applyTimerAction(toRow(state), lengths(state), { type: "reset" }, stamp());
        if (!step.changed) return;
        set(fieldsOf(step.timer));
        publishTimerCommand({ command: commandFor({ type: "reset" }, state.version), session: null });
      },
      skip: () => {
        const state = get();
        if (!syncIsActive()) {
          set(skipCore(toCore(state)));
          return;
        }
        const step = applyTimerAction(toRow(state), lengths(state), { type: "skip" }, stamp());
        if (!step.changed) return;
        set(fieldsOf(step.timer));
        publishTimerCommand({ command: commandFor({ type: "skip" }, state.version), session: null });
      },
      selectPhase: (phase) => {
        const state = get();
        if (!syncIsActive()) {
          set(selectPhaseCore(toCore(state), phase));
          return;
        }
        const step = applyTimerAction(toRow(state), lengths(state), { type: "select", phase }, stamp());
        if (!step.changed) return;
        set(fieldsOf(step.timer));
        publishTimerCommand({ command: commandFor({ type: "select", phase }, state.version), session: null });
      },
      toggleAutoStart: (phase) => {
        const next = noteSettings(toggleCore(toCore(get()), phase));
        set(next);
        if (syncIsActive()) settingsChanged();
      },
      setPhaseSeconds: (phase, sec) => {
        const next = noteSettings(setSecondsCore(toCore(get()), phase, sec));
        set(next);
        if (syncIsActive()) settingsChanged();
      },
      setDurations: (focusMin, shortMin, longMin) => {
        let next = toCore(get());
        next = setSecondsCore(next, "focus", focusMin * 60);
        next = setSecondsCore(next, "shortBreak", shortMin * 60);
        next = setSecondsCore(next, "longBreak", longMin * 60);
        set(noteSettings(next));
        if (syncIsActive()) settingsChanged();
      },
      setLongBreakEvery: (n) => {
        const next = noteSettings(setEveryCore(toCore(get()), n));
        set(next);
        if (syncIsActive()) settingsChanged();
      },
      catchUp: (now) => {
        if (syncIsActive()) return false;
        const before = toCore(get());
        const result = catchUpCore(before, now);
        if (!result.ended) return false;
        const session = finishedFocusSession(before, crypto.randomUUID());
        const completedSessions = session
          ? [...get().completedSessions, session].slice(-MAX_GUEST_SESSIONS)
          : get().completedSessions;
        set({ ...result.state, completedSessions });
        return true;
      },
      completeIfDue: () => {
        if (!syncIsActive()) return false;
        const state = get();
        const at = syncNow();
        if (state.status !== "running" || !state.runId) return false;
        if (remainingMs(state, at) > 0) return false;
        if (completingRunId === state.runId) return false;
        completingRunId = state.runId;
        const chime = chimedRunId !== state.runId;
        chimedRunId = state.runId;
        const before = toRow(state);
        const nextRunId = crypto.randomUUID();
        const step = applyTimerAction(before, lengths(state), { type: "complete", nextRunId }, at);
        if (!step.changed) {
          completingRunId = null;
          return false;
        }
        set(fieldsOf(step.timer));
        publishTimerCommand({
          command: commandFor({ type: "complete", nextRunId }, state.version),
          session: step.session ? sessionBody(before, step.session) : null,
        });
        return chime;
      },
      adoptServer: (syncState, options) => {
        const settings = syncState.settings;
        const timer = syncState.activeTimer;
        const focusSec = settings.focusMin * 60;
        const shortBreakSec = settings.shortBreakMin * 60;
        const longBreakSec = settings.longBreakMin * 60;
        const local = get();
        const idlePlanned = (phase: Phase) =>
          phase === "focus" ? focusSec : phase === "shortBreak" ? shortBreakSec : longBreakSec;
        const patch: Partial<TimerStore> = {
          focusSec,
          shortBreakSec,
          longBreakSec,
          longBreakEvery: settings.longBreakEvery,
          autoStartFocus: settings.autoStartFocus,
          autoStartShortBreak: settings.autoStartShortBreak,
          autoStartLongBreak: settings.autoStartLongBreak,
          settingsUpdatedAt: Date.parse(settings.updatedAt),
        };
        if (options.timer) {
          patch.phase = timer.phase;
          patch.status = timer.status;
          patch.startedAt = timer.status === "idle" ? null : Date.parse(timer.startedAt);
          patch.plannedSec = timer.status === "idle" ? idlePlanned(timer.phase) : timer.plannedSec;
          patch.pausedAt = timer.pausedAt ? Date.parse(timer.pausedAt) : null;
          patch.pausedTotalSec = timer.pausedTotalSec;
          patch.completedFocusInCycle = timer.cycleIndex;
          patch.version = timer.version;
          patch.runId = timer.runId;
          patch.taskId = timer.taskId;
        } else if (local.status === "idle") {
          patch.plannedSec = idlePlanned(local.phase);
        }
        set(patch);
        applyTheme(settings.themeId);
        if (options.kind === "early") {
          completingRunId = null;
          chimedRunId = null;
        } else if (options.timer && timer.runId !== completingRunId) {
          completingRunId = null;
        }
      },
      resetGuest: () => {
        completingRunId = null;
        chimedRunId = null;
        set({
          ...defaultTimer,
          ...syncDefaults,
          completedSessions: [],
        });
      },
    }),
    {
      name: "pomodoro-timer",
      // Reload should restore a running timer. Hydrate in the browser only:
      // the server has no localStorage, and the first paint must match the default state.
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<TimerStore>;
        return {
          ...current,
          ...saved,
          version: saved.version ?? 0,
          runId: saved.runId ?? "",
          taskId: saved.taskId ?? null,
          settingsUpdatedAt: saved.settingsUpdatedAt ?? 0,
          completedSessions: saved.completedSessions ?? [],
        };
      },
      partialize: (state) => ({
        ...toCore(state),
        version: state.version,
        runId: state.runId,
        taskId: state.taskId,
        settingsUpdatedAt: state.settingsUpdatedAt,
        completedSessions: state.completedSessions,
      }),
    },
  ),
);

function fieldsOf(timer: TransitionTimer): Partial<TimerStore> {
  return {
    phase: timer.phase,
    status: timer.status,
    startedAt: timer.startedAt,
    plannedSec: timer.plannedSec,
    pausedAt: timer.pausedAt,
    pausedTotalSec: timer.pausedTotalSec,
    completedFocusInCycle: timer.cycleIndex,
    version: timer.version,
    runId: timer.runId,
    taskId: timer.taskId,
  };
}
