import type { TimerCore } from "./logic";

/** A focus the guest finished on this device. The id is created here so a later upload can retry. */
export type GuestFocusSession = {
  id: string;
  phase: "focus";
  startedAt: number;
  endedAt: number;
  durationSec: number;
  completed: true;
};

/**
 * The focus that was running, if the clock has used it up.
 * Skip does not call this. A break that ends does not either.
 */
export function finishedFocusSession(state: TimerCore, id: string): GuestFocusSession | null {
  if (state.phase !== "focus" || state.status !== "running" || state.startedAt == null) return null;
  if (!(state.plannedSec > 0)) return null;
  const endedAt =
    state.startedAt + Math.round(state.pausedTotalSec * 1000) + Math.round(state.plannedSec * 1000);
  if (!(endedAt > state.startedAt)) return null;
  return {
    id,
    phase: "focus",
    startedAt: state.startedAt,
    endedAt,
    durationSec: Math.round(state.plannedSec),
    completed: true,
  };
}
