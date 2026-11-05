// No audio file: a short beep from the Web Audio API works offline and needs no download.
// Browsers stay silent until a click, and they suspend the context again when the tab is hidden,
// so we resume it on the first play press and again when a phase ends.

import type { Phase } from "@/lib/timer/transitions";
import { useTimerStore } from "./store";

let audio: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  audio = audio ?? new AudioContext();
  return audio;
}

export function unlockAudio(): void {
  const ctx = context();
  if (!ctx) return;
  void ctx.resume();
}

type PhaseSounds = {
  soundId: string;
  focusSoundId: string | null;
  shortBreakSoundId: string | null;
  longBreakSoundId: string | null;
};

/** The sound for the phase that just ended: its own id if it has one, else the end sound. */
export function soundForPhase(phase: Phase, sounds: PhaseSounds): string {
  const own =
    phase === "focus" ? sounds.focusSoundId : phase === "shortBreak" ? sounds.shortBreakSoundId : sounds.longBreakSoundId;
  return own ?? sounds.soundId;
}

/**
 * The phase that just ended, from the phase now showing. A focus ends into a break; a break ends
 * into focus, and the cycle count is back at 0 only after a long break.
 */
export function endedPhaseOf(current: Phase, cycleIndex: number): Phase {
  if (current !== "focus") return "focus";
  return cycleIndex === 0 ? "longBreak" : "shortBreak";
}

type Voice = { frequency: number; at: number; length: number; peak: number; type: OscillatorType };

/** The notes of each sound, as offsets in seconds from the start. "none" has no notes. */
export function voicesOf(id: string): Voice[] {
  switch (id) {
    case "bell":
      return [
        { frequency: 660, at: 0, length: 1.2, peak: 0.16, type: "sine" },
        { frequency: 1820, at: 0, length: 0.6, peak: 0.05, type: "sine" },
      ];
    case "digital":
      return [0, 0.14, 0.28].map((at) => ({ frequency: 1000, at, length: 0.09, peak: 0.08, type: "square" as const }));
    case "soft":
      return [
        { frequency: 523, at: 0, length: 0.9, peak: 0.1, type: "sine" },
        { frequency: 659, at: 0.25, length: 0.9, peak: 0.08, type: "sine" },
      ];
    case "none":
      return [];
    default:
      return [
        { frequency: 880, at: 0, length: 0.28, peak: 0.15, type: "sine" },
        { frequency: 1175, at: 0.16, length: 0.28, peak: 0.15, type: "sine" },
      ];
  }
}

/** Plays the end sound for a phase. Without an argument it works out the phase that just ended from the store. */
export function playChime(endedPhase?: Phase): void {
  const state = useTimerStore.getState();
  const id = soundForPhase(endedPhase ?? endedPhaseOf(state.phase, state.cycleIndex), state);
  const voices = voicesOf(id);
  if (voices.length === 0) return;
  const ctx = context();
  if (!ctx) return;
  void ctx
    .resume()
    .then(() => {
      const startAt = ctx.currentTime;
      for (const voice of voices) tone(ctx, voice, startAt + voice.at);
    })
    .catch(() => {
      // The timer has already moved on. A blocked beep should not break the phase change.
    });
}

function tone(ctx: AudioContext, voice: Voice, at: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = voice.type;
  osc.frequency.value = voice.frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(voice.peak, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + voice.length);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + voice.length + 0.02);
}

/** Ask the first time the user presses play, not on page load. */
export function requestNotificationPermission(): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") void Notification.requestPermission();
}

export function notifyPhase(title: string, body: string): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body });
  } catch {
    // Android Chrome only allows notifications from a service worker.
    void showFromServiceWorker(title, body);
  }
}

function showFromServiceWorker(title: string, body: string): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve();
  return navigator.serviceWorker.ready
    .then((registration) => registration.showNotification(title, { body, icon: "/icons/icon-192.png" }))
    .catch(() => {
      // No worker (dev mode, or not registered yet): the chime still plays.
    });
}
