import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { SessionInput, SyncState } from "@/lib/sync/contract";
import { publishTimerCommand, settingsChanged, syncIsActive, syncNow } from "@/lib/sync/engine";
import { applyTheme } from "@/features/settings/theme";
import { catchUp as catchUpCore } from "@/lib/timer/catch-up";
import { actionToCommand } from "@/lib/timer/commands";
import { remainingMs } from "@/lib/timer/remaining";
import {
  applyTimerAction,
  type PhaseSettings,
  type TimerAction,
  type TransitionTimer,
} from "@/lib/timer/transitions";
import type { GuestFocusSession } from "./sessions";
import {
  defaultTimer,
  setLongBreakEvery as setEveryCore,
  setPhaseSeconds as setSecondsCore,
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
  /** Picks (or clears) the task for the focus session. Never touches the running countdown. */
  setTask: (taskId: string | null) => void;
  adoptServer: (
    state: SyncState,
    options: { timer: boolean; kind: "ok" | "conflict" | "early" | "pull"; keepTask?: boolean },
  ) => void;
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

const coreKeys = Object.keys(defaultTimer) as (keyof TimerCore)[];

/** The persisted timer and settings fields of the store, without actions or sync fields. */
function coreOf(state: TimerStore): TimerCore {
  const core: Record<string, unknown> = {};
  for (const key of coreKeys) core[key] = state[key];
  return core as TimerCore;
}

/** Store -> the shape every transition works on. */
function toTimer(state: TimerStore): TransitionTimer {
  return {
    phase: state.phase,
    status: state.status,
    startedAt: state.startedAt,
    plannedSec: state.plannedSec,
    pausedAt: state.pausedAt,
    pausedTotalSec: state.pausedTotalSec,
    cycleIndex: state.cycleIndex,
    runId: state.runId,
    version: state.version,
    taskId: state.taskId,
  };
}

/** Store -> the lengths and auto-start flags every transition reads. */
function toSettings(state: TimerCore): PhaseSettings {
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

/** A transitioned timer -> the store fields it replaces. */
function fieldsOf(timer: TransitionTimer): Partial<TimerStore> {
  return {
    phase: timer.phase,
    status: timer.status,
    startedAt: timer.startedAt,
    plannedSec: timer.plannedSec,
    pausedAt: timer.pausedAt,
    pausedTotalSec: timer.pausedTotalSec,
    cycleIndex: timer.cycleIndex,
    version: timer.version,
    runId: timer.runId,
    taskId: timer.taskId,
  };
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

/**
 * The one path for every timer action. Guests and signed-in users apply the same transition;
 * only a signed-in user also publishes the command (and the focus it finished, if any).
 */
function step(action: TimerAction, now?: number): boolean {
  const state = useTimerStore.getState();
  const at = syncIsActive() ? syncNow() : (now ?? Date.now());
  const before = toTimer(state);
  const result = applyTimerAction(before, toSettings(state), action, at);
  if (!result.changed) return false;
  useTimerStore.setState(fieldsOf(result.timer));
  if (syncIsActive()) {
    publishTimerCommand({
      command: actionToCommand(action, state.version),
      session: result.session ? sessionBody(before, result.session) : null,
    });
  }
  return true;
}

export const useTimerStore = create<TimerStore>()(
  persist(
    (set, get) => ({
      ...defaultTimer,
      ...syncDefaults,
      completedSessions: [],
      start: (now) => step({ type: "start", runId: crypto.randomUUID() }, now),
      pause: (now) => step({ type: "pause" }, now),
      resume: (now) => step({ type: "resume" }, now),
      reset: () => step({ type: "reset" }),
      skip: () => step({ type: "skip" }),
      selectPhase: (phase) => step({ type: "select", phase }),
      setTask: (taskId) => {
        if (get().taskId === taskId) return;
        // Applied here at once. Signed in, the pick also goes to the server through the queue;
        // it has no version check, so it can never interrupt or conflict with the timer.
        set({ taskId });
        if (syncIsActive()) publishTimerCommand({ command: { action: "setTask", taskId }, session: null });
      },
      toggleAutoStart: (phase) => {
        const next = noteSettings(toggleCore(coreOf(get()), phase));
        set(next);
        if (syncIsActive()) settingsChanged();
      },
      setPhaseSeconds: (phase, sec) => {
        const next = noteSettings(setSecondsCore(coreOf(get()), phase, sec));
        set(next);
        if (syncIsActive()) settingsChanged();
      },
      setDurations: (focusMin, shortMin, longMin) => {
        let next = coreOf(get());
        next = setSecondsCore(next, "focus", focusMin * 60);
        next = setSecondsCore(next, "shortBreak", shortMin * 60);
        next = setSecondsCore(next, "longBreak", longMin * 60);
        set(noteSettings(next));
        if (syncIsActive()) settingsChanged();
      },
      setLongBreakEvery: (n) => {
        const next = noteSettings(setEveryCore(coreOf(get()), n));
        set(next);
        if (syncIsActive()) settingsChanged();
      },
      catchUp: (now) => {
        if (syncIsActive()) return false;
        const state = get();
        const result = catchUpCore(
          toTimer(state),
          toSettings(state),
          now,
          () => crypto.randomUUID(),
          MAX_GUEST_SESSIONS,
        );
        if (!result.ended) return false;
        set({
          ...fieldsOf(result.timer),
          completedSessions: [...state.completedSessions, ...result.sessions].slice(-MAX_GUEST_SESSIONS),
        });
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
        if (!step({ type: "complete", nextRunId: crypto.randomUUID() }, at)) {
          completingRunId = null;
          return false;
        }
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
          patch.cycleIndex = timer.cycleIndex;
          patch.version = timer.version;
          patch.runId = timer.runId;
          // A pick still waiting in the queue is newer than what the server just sent.
          patch.taskId = options.keepTask ? local.taskId : timer.taskId;
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
      version: 1,
      // v0 saved the cycle count as completedFocusInCycle. Same number, now called cycleIndex.
      migrate: (persisted, from) => {
        if (from >= 1 || persisted == null || typeof persisted !== "object") return persisted as TimerStore;
        const { completedFocusInCycle, ...rest } = persisted as Record<string, unknown>;
        return {
          ...rest,
          cycleIndex: rest.cycleIndex ?? completedFocusInCycle ?? defaultTimer.cycleIndex,
        } as unknown as TimerStore;
      },
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
        ...coreOf(state),
        version: state.version,
        runId: state.runId,
        taskId: state.taskId,
        settingsUpdatedAt: state.settingsUpdatedAt,
        completedSessions: state.completedSessions,
      }),
    },
  ),
);
