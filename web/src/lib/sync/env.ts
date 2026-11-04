import type { SyncEnv } from "./ports";

/** The production environment: window, document, navigator, crypto and Date. */
export const browserEnv: SyncEnv = {
  isOnline: () => navigator.onLine,
  isVisible: () => document.visibilityState === "visible",
  now: () => Date.now(),
  uuid: () => crypto.randomUUID(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (handle) => window.clearInterval(handle as number),
  onVisibilityChange: (fn) => listen(document, "visibilitychange", fn),
  onFocus: (fn) => listen(window, "focus", fn),
  onOnline: (fn) => listen(window, "online", fn),
  onOffline: (fn) => listen(window, "offline", fn),
};

function listen(target: EventTarget, type: string, fn: () => void): () => void {
  target.addEventListener(type, fn);
  return () => target.removeEventListener(type, fn);
}
