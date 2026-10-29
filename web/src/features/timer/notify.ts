// No audio file: a short beep from the Web Audio API works offline and needs no download.
// Browsers stay silent until a click, and they suspend the context again when the tab is hidden,
// so we resume it on the first play press and again when a phase ends.

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

export function playChime(): void {
  const ctx = context();
  if (!ctx) return;
  void ctx
    .resume()
    .then(() => {
      const startAt = ctx.currentTime;
      tone(ctx, 880, startAt);
      tone(ctx, 1175, startAt + 0.16);
    })
    .catch(() => {
      // The timer has already moved on. A blocked beep should not break the phase change.
    });
}

function tone(ctx: AudioContext, frequency: number, at: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.15, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.3);
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
    // A few browsers only allow notifications from a service worker. Phase 9 covers that.
  }
}
