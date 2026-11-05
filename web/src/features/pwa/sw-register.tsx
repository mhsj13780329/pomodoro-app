"use client";

import { useEffect } from "react";
import { SerwistProvider } from "@serwist/turbopack/react";

const enabled = process.env.NODE_ENV === "production";

/** Registers the service worker. Off in `next dev`, where a cached shell gets in the way. */
export function SwRegister() {
  // The first page load happens before the worker exists, so it is never cached on the way in,
  // and SerwistProvider's own message can arrive before the worker is active. Once the worker is
  // ready, ask it to cache this page, so a reload with no network still opens the timer.
  useEffect(() => {
    if (!enabled || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    void navigator.serviceWorker.ready.then((registration) => {
      if (cancelled || !navigator.onLine) return;
      registration.active?.postMessage({
        type: "CACHE_URLS",
        payload: { urlsToCache: [window.location.pathname] },
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SerwistProvider
      swUrl="/sw.js"
      disable={!enabled}
      // The page reloading when the connection returns would interrupt a running timer.
      reloadOnOnline={false}
      options={{ scope: "/" }}
    />
  );
}
