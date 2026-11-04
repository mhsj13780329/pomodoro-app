// The app-wide sync engine: one create-engine.ts instance wired to the browser. The functions
// below are what the stores and components call. Tests build their own engine with fakes instead.

import type { TaskBatch } from "@/lib/tasks/contract";
import { httpTransport } from "./api";
import { createSyncEngine, type SyncEngine } from "./create-engine";
import { idbStorage } from "./db";
import { browserEnv } from "./env";
import type { SyncHost, TimerOutbound } from "./ports";
import { setSyncView } from "./status";

export type { SettingsSnapshot, SyncHost, TasksHost, TimerOutbound } from "./ports";

let current: SyncEngine | null = null;
let stopCurrent: (() => void) | null = null;

/** Starts sync for one signed-in user and returns the stop function. Guests never call this. */
export function startSync(userId: string, host: SyncHost): () => void {
  stopCurrent?.();
  current = createSyncEngine({ env: browserEnv, transport: httpTransport, storage: idbStorage, host });
  const stop = current.start(userId);
  stopCurrent = stop;
  return stop;
}

export function syncIsActive(): boolean {
  return current?.isActive() ?? false;
}

/** `Date.now()` corrected by the server clock offset. */
export function syncNow(): number {
  return current ? current.now() : browserEnv.now();
}

export function publishTimerCommand(item: TimerOutbound) {
  current?.publishTimer(item);
}

export function settingsChanged() {
  current?.settingsChanged();
}

/**
 * Queues task, project and tag rows for upload. The store has already applied them locally,
 * so the screen never waits for the network. Safe to call when offline: they wait in IndexedDB.
 */
export function publishTaskWrites(rows: Partial<TaskBatch>) {
  current?.publishTasks(rows);
}

/** Uploads what can be uploaded, then returns how many items still wait. */
export function flushForLogout(): Promise<number> {
  return current ? current.flush({ reason: "logout" }) : Promise.resolve(0);
}

export async function wipeDevice(): Promise<void> {
  if (current) await current.wipe();
  else setSyncView({ kind: "guest" });
  stopCurrent = null;
}
