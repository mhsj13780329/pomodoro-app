// Remaining time is always derived. Nothing in the app stores a ticking number.

export type RemainingStatus = "idle" | "running" | "paused";

export type RemainingInput = {
  status: RemainingStatus;
  startedAt: number | null;
  plannedSec: number;
  pausedAt: number | null;
  pausedTotalSec: number;
};

/** A complete call this close to the end is still on time. Covers latency, not a wrong phase. */
export const COMPLETE_SLACK_MS = 3_000;

function ms(sec: number): number {
  return Math.round(sec * 1000);
}

/**
 * Time left in this phase.
 * While paused, the clock is frozen at pausedAt. Otherwise it is `now`.
 * Pass `adjustedNow` so a wrong device clock does not change the result.
 */
export function remainingMs(state: RemainingInput, now: number): number {
  if (state.status === "idle" || state.startedAt == null) {
    return ms(state.plannedSec);
  }
  const effectiveNow = state.status === "paused" && state.pausedAt != null ? state.pausedAt : now;
  const elapsed = effectiveNow - state.startedAt - ms(state.pausedTotalSec);
  return Math.max(0, ms(state.plannedSec) - elapsed);
}

/** Seconds to show on the ring. Rounded up so the first instant still shows the full duration. */
export function displaySeconds(state: RemainingInput, now: number): number {
  return Math.ceil(remainingMs(state, now) / 1000 - 1e-6);
}

/** `clockOffset` is `serverNow - Date.now()`, smoothed by the sync layer. */
export function adjustedNow(dateNow: number, clockOffset: number): number {
  return dateNow + clockOffset;
}

/** True only for a running phase that is finished or inside the slack window. */
export function canComplete(state: RemainingInput, now: number, slackMs = COMPLETE_SLACK_MS): boolean {
  if (state.status !== "running" || state.startedAt == null) return false;
  return remainingMs(state, now) <= slackMs;
}
