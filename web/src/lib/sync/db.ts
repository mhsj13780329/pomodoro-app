import { del, get, set } from "idb-keyval";
import type { SessionInput, TimerCommand } from "./contract";

export type QueuedAction = {
  id: string;
  command: TimerCommand;
  /** Focus session to drop if the server says this complete was too early. */
  sessionId: string | null;
};

function actionsKey(userId: string) {
  return `pomodoro-sync-actions:${userId}`;
}

function sessionsKey(userId: string) {
  return `pomodoro-sync-sessions:${userId}`;
}

export async function readActions(userId: string): Promise<QueuedAction[]> {
  return (await get<QueuedAction[]>(actionsKey(userId))) ?? [];
}

export async function writeActions(userId: string, actions: QueuedAction[]): Promise<void> {
  await set(actionsKey(userId), actions);
}

export async function readSessions(userId: string): Promise<SessionInput[]> {
  return (await get<SessionInput[]>(sessionsKey(userId))) ?? [];
}

export async function writeSessions(userId: string, sessions: SessionInput[]): Promise<void> {
  await set(sessionsKey(userId), sessions);
}

export async function clearQueues(userId: string): Promise<void> {
  await Promise.all([del(actionsKey(userId)), del(sessionsKey(userId))]);
}
