import de from "../../../messages/de.json";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import fa from "../../../messages/fa.json";
import fr from "../../../messages/fr.json";
import ja from "../../../messages/ja.json";
import ko from "../../../messages/ko.json";
import { remainingMs } from "@/lib/timer/remaining";
import type { WirePhase, WireStatus } from "@/lib/sync/contract";

// Pure parts of the phase-end push: which timers are due and what the notification says.
// Mirrors chimeFor in features/timer/timer-runtime.tsx, so the push reads like the in-page one.

export type PushPayload = { title: string; body: string; tag: string; url: string };

type TimerStrings = {
  timer: { phases: Record<WirePhase, string>; started: string; ready: string };
};

const catalogs: Record<string, TimerStrings> = { de, en, es, fa, fr, ja, ko };

export type DueCandidate = {
  status: "IDLE" | "RUNNING" | "PAUSED";
  startedAt: Date;
  plannedSec: number;
  pausedTotalSec: number;
};

/** A running phase whose end time (start + planned + paused total) has passed. */
export function isDue(row: DueCandidate, now: number): boolean {
  if (row.status !== "RUNNING") return false;
  return (
    remainingMs(
      {
        status: "running",
        startedAt: row.startedAt.getTime(),
        plannedSec: row.plannedSec,
        pausedAt: null,
        pausedTotalSec: row.pausedTotalSec,
      },
      now,
    ) === 0
  );
}

export function buildPayload(locale: string, phase: WirePhase, status: WireStatus): PushPayload {
  const code = locale in catalogs ? locale : "fa";
  const strings = catalogs[code].timer;
  return {
    title: strings.phases[phase],
    body: status === "running" ? strings.started : strings.ready,
    tag: "phase-end",
    url: `/${code}`,
  };
}
