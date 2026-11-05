"use client";

import { useEffect } from "react";
import { useNotesStore } from "./store";

/** Loads the saved notes, then syncs now, when the tab is shown again and when the network returns. */
export function useNotesSync(userId: string | null, pro: boolean) {
  useEffect(() => {
    if (!userId) return;
    void useNotesStore.getState().start(userId, pro);
    const run = () => void useNotesStore.getState().sync();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("online", run);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", run);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVisible);
      useNotesStore.getState().stop();
    };
    // `pro` only seeds the first render; later changes come from the server through the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
}
