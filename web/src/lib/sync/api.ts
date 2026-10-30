import { taskBatchResultSchema, type TaskBatch, type TaskBatchResult } from "@/lib/tasks/contract";
import {
  sessionBatchResultSchema,
  syncStateSchema,
  type QueuedCommand,
  type SessionBatchResult,
  type SessionInput,
  type SettingsPatch,
  type SyncState,
} from "./contract";

export type SyncResponse =
  | { ok: true; status: number; state: SyncState; sentAt: number; receivedAt: number }
  | { ok: false; network: boolean; status: number };

async function send(path: string, method: string, body?: unknown): Promise<SyncResponse> {
  const sentAt = Date.now();
  try {
    const response = await fetch(path, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const receivedAt = Date.now();
    if (response.status === 401 || response.status === 400) {
      return { ok: false, network: false, status: response.status };
    }
    const retryable = response.status === 429 || (response.status !== 409 && response.status !== 422 && !response.ok);
    if (retryable) return { ok: false, network: true, status: response.status };
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return { ok: false, network: true, status: response.status };
    }
    const parsed = syncStateSchema.safeParse(json);
    if (!parsed.success) return { ok: false, network: true, status: response.status };
    return { ok: true, status: response.status, state: parsed.data, sentAt, receivedAt };
  } catch {
    return { ok: false, network: true, status: 0 };
  }
}

/** `tasksSince` asks for the tasks block too: 0 for everything, or the cursor from the last pull. */
export function fetchState(tasksSince?: number): Promise<SyncResponse> {
  const query = tasksSince === undefined ? "" : `?tasksSince=${Math.max(0, Math.floor(tasksSince))}`;
  return send(`/api/sync/state${query}`, "GET");
}

export function putSettings(patch: SettingsPatch): Promise<SyncResponse> {
  return send("/api/settings", "PUT", patch);
}

export function postTimer(command: QueuedCommand): Promise<SyncResponse> {
  return send("/api/timer", "POST", command);
}

export async function postSessions(
  sessions: SessionInput[],
): Promise<{ ok: true; result: SessionBatchResult } | { ok: false; network: boolean }> {
  try {
    const response = await fetch("/api/sessions", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessions }),
    });
    if (!response.ok) return { ok: false, network: response.status !== 400 && response.status !== 401 };
    const parsed = sessionBatchResultSchema.safeParse(await response.json());
    if (!parsed.success) return { ok: false, network: true };
    return { ok: true, result: parsed.data };
  } catch {
    return { ok: false, network: true };
  }
}

export async function postTaskBatch(
  batch: TaskBatch,
): Promise<{ ok: true; result: TaskBatchResult } | { ok: false; network: boolean; status: number }> {
  try {
    const response = await fetch("/api/tasks", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(batch),
    });
    // 400 means the batch itself is malformed and would never be accepted. 401 means signed out.
    if (!response.ok) return { ok: false, network: response.status !== 400, status: response.status };
    const parsed = taskBatchResultSchema.safeParse(await response.json());
    if (!parsed.success) return { ok: false, network: true, status: response.status };
    return { ok: true, result: parsed.data };
  } catch {
    return { ok: false, network: true, status: 0 };
  }
}
