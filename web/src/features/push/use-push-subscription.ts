"use client";

import { useEffect } from "react";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function supported(): boolean {
  return (
    typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  );
}

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function ensureSubscribed(): Promise<void> {
  if (!supported() || !PUBLIC_KEY || Notification.permission !== "granted") return;
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) }));
  // Posting again is an upsert, so it also re-attaches the endpoint after an account switch.
  await fetch("/api/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
}

/** Best effort: forget this browser's push endpoint on the server, then drop it locally. */
export async function unsubscribePush(): Promise<void> {
  if (!supported()) return;
  try {
    const subscription = await currentSubscription();
    if (!subscription) return;
    await fetch("/api/push", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
  } catch {
    // Signing out must not fail because push cleanup did.
  }
}

/** For a signed-in user: keeps this browser subscribed while notifications are allowed. */
export function usePushSubscription(userId: string | undefined): void {
  useEffect(() => {
    if (!userId || !supported() || !PUBLIC_KEY) return;
    const run = () => {
      ensureSubscribed().catch(() => {});
    };
    run();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    let status: PermissionStatus | null = null;
    let cancelled = false;
    navigator.permissions
      ?.query({ name: "notifications" })
      .then((result) => {
        if (cancelled) return;
        status = result;
        result.addEventListener("change", run);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      status?.removeEventListener("change", run);
    };
  }, [userId]);
}
