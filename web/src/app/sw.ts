/// <reference lib="webworker" />
// The service worker. Built by @serwist/turbopack from the route in app/serwist/[path].
// Do not import app code here: it runs in the worker, not the page.
import { defaultCache } from "@serwist/turbopack/worker";
import { NetworkOnly, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const LOCALES = ["fa", "en", "es", "fr", "de", "ja", "ko"];
const DEFAULT_LOCALE = "fa";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Never cache the API: tasks, sync, payments and push must always hit the server.
    {
      matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
});

// A document that is neither on the network nor in the cache gets the offline page of the
// language in its URL (all of them are precached).
serwist.setCatchHandler(async ({ request, url }) => {
  if (request.destination !== "document") return Response.error();
  const first = url.pathname.split("/")[1];
  const locale = LOCALES.includes(first) ? first : DEFAULT_LOCALE;
  return (
    (await serwist.matchPrecache(`/${locale}/offline`)) ??
    (await serwist.matchPrecache(`/${DEFAULT_LOCALE}/offline`)) ??
    Response.error()
  );
});

serwist.addEventListeners();

type PushPayload = { title: string; body: string; tag: string; url: string };

// Contract with the server: JSON { title, body, tag, url }.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    return;
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // The open page shows its own notification and chime.
      if (windows.some((client) => client.visibilityState === "visible" && client.focused)) return;
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        tag: payload.tag,
        renotify: true,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url: payload.url },
      } as NotificationOptions);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | null)?.url ?? "/";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows[0];
      if (existing) {
        await existing.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
