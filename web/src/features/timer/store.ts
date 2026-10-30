import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
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
  setLongBreakEvery: (n: number) => void;
  /** True when a phase had already ended and the schedule moved on. */
  catchUp: (now: number) => boolean;
};

const MAX_GUEST_SESSIONS = 200;

export type TimerStore = TimerCore &
  Actions & {
    completedSessions: GuestFocusSession[];
  };

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

export const useTimerStore = create<TimerStore>()(
  persist(
    (set, get) => ({
      ...defaultTimer,
      completedSessions: [],
      start: (now) => set(startCore(toCore(get()), now)),
      pause: (now) => set(pauseCore(toCore(get()), now)),
      resume: (now) => set(resumeCore(toCore(get()), now)),
      reset: () => set(resetCore(toCore(get()))),
      skip: () => set(skipCore(toCore(get()))),
      selectPhase: (phase) => set(selectPhaseCore(toCore(get()), phase)),
      toggleAutoStart: (phase) => set(toggleCore(toCore(get()), phase)),
      setPhaseSeconds: (phase, sec) => set(setSecondsCore(toCore(get()), phase, sec)),
      setLongBreakEvery: (n) => set(setEveryCore(toCore(get()), n)),
      catchUp: (now) => {
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
    }),
    {
      name: "pomodoro-timer",
      // Reload should restore a running timer. Hydrate in the browser only:
      // the server has no localStorage, and the first paint must match the default state.
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (state) => ({
        ...toCore(state),
        completedSessions: state.completedSessions,
      }),
    },
  ),
);
