"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

/** Chromium's install prompt event; not in lib.dom. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// The event fires once, early, so it is captured at module level and shared.
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

type Mode = "hidden" | "prompt" | "ios";

function detect(): Mode {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "hidden";
  if (deferred) return "prompt";
  const ua = navigator.userAgent;
  // iPadOS reports as a Mac with a touch screen.
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "hidden";
}

export function InstallGuide() {
  const t = useTranslations("install");
  const mode = useSyncExternalStore<Mode>(subscribe, detect, () => "hidden");

  if (mode === "hidden") return null;

  async function install() {
    if (!deferred) return;
    const event = deferred;
    deferred = null;
    emit();
    await event.prompt();
    await event.userChoice;
  }

  return (
    <section className="mt-3 rounded-card border border-line bg-surface p-3.5">
      <h2 className="mb-1 text-base font-semibold">{t("title")}</h2>
      <p className="mb-2.5 text-sm text-muted">{t("description")}</p>
      {mode === "prompt" ? (
        <button
          type="button"
          onClick={install}
          className="min-h-11 cursor-pointer rounded-nav border-0 bg-focus px-5 text-[15px] font-semibold text-white"
        >
          {t("button")}
        </button>
      ) : (
        <>
          <ol className="m-0 flex list-decimal flex-col gap-1.5 ps-5 text-[15px]">
            <li>{t("iosStepShare")}</li>
            <li>{t("iosStepAdd")}</li>
            <li>{t("iosStepOpen")}</li>
          </ol>
          <p className="mt-2.5 text-sm text-muted">{t("iosNotifications")}</p>
        </>
      )}
    </section>
  );
}
