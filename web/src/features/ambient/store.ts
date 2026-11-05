import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AmbientMixEntry } from "@/lib/settings/catalog";
import { DEFAULT_VOLUME } from "./mix";

/**
 * The ambient selection, saved on this device. Playback (playing or not) is never saved or synced.
 * `ambientId` and `ambientMix` mirror the synced settings fields of the same names.
 * Settings sync adopts a server value with `adopt` and listens for local edits with `subscribeAmbientEdits`.
 */
type State = {
  ambientId: string | null;
  ambientMix: AmbientMixEntry[] | null;
  /** Volume of the single track (the mix carries its own per-track volumes). Local only. */
  singleVolume: number;
  playing: boolean;
  setSelection: (next: { ambientId: string | null; ambientMix: AmbientMixEntry[] | null }) => void;
  setSingleVolume: (v: number) => void;
  setPlaying: (playing: boolean) => void;
  /** Applies a value that came from the server. Does not count as a local edit. */
  adopt: (next: { ambientId: string | null; ambientMix: AmbientMixEntry[] | null }) => void;
};

const editListeners = new Set<(sel: { ambientId: string | null; ambientMix: AmbientMixEntry[] | null }) => void>();

/** Called after every local selection change; sync wires this to a settings push. */
export function subscribeAmbientEdits(fn: (sel: { ambientId: string | null; ambientMix: AmbientMixEntry[] | null }) => void) {
  editListeners.add(fn);
  return () => editListeners.delete(fn);
}

export const useAmbientStore = create<State>()(
  persist(
    (set, get) => ({
      ambientId: null,
      ambientMix: null,
      singleVolume: DEFAULT_VOLUME,
      playing: false,
      setSelection: (next) => {
        set(next);
        for (const fn of editListeners) fn({ ambientId: get().ambientId, ambientMix: get().ambientMix });
      },
      setSingleVolume: (singleVolume) => set({ singleVolume }),
      setPlaying: (playing) => set({ playing }),
      adopt: (next) => set(next),
    }),
    {
      name: "pomodoro-ambient",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ ambientId: s.ambientId, ambientMix: s.ambientMix, singleVolume: s.singleVolume }),
    },
  ),
);
