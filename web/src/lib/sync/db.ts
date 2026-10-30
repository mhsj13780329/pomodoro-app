import { del, get, set } from "idb-keyval";
import type { ProjectWire, TagWire, TaskWire } from "@/lib/tasks/contract";
import type { QueuedCommand, SessionInput } from "./contract";

export type QueuedAction = {
  id: string;
  command: QueuedCommand;
  /** Focus session to drop if the server says this complete was too early. */
  sessionId: string | null;
};

/**
 * Task, project and tag writes waiting to upload. One slot per row id holding the latest
 * full row: editing a task three times offline uploads it once, and a retry is harmless
 * because the server judges each row by its updatedAt.
 */
export type QueuedTaskRows = {
  projects: Record<string, ProjectWire>;
  tags: Record<string, TagWire>;
  tasks: Record<string, TaskWire>;
};

export const emptyTaskQueue = (): QueuedTaskRows => ({ projects: {}, tags: {}, tasks: {} });

function actionsKey(userId: string) {
  return `pomodoro-sync-actions:${userId}`;
}

function sessionsKey(userId: string) {
  return `pomodoro-sync-sessions:${userId}`;
}

function tasksKey(userId: string) {
  return `pomodoro-sync-tasks:${userId}`;
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

export async function readTaskQueue(userId: string): Promise<QueuedTaskRows> {
  return (await get<QueuedTaskRows>(tasksKey(userId))) ?? emptyTaskQueue();
}

export async function writeTaskQueue(userId: string, queue: QueuedTaskRows): Promise<void> {
  await set(tasksKey(userId), queue);
}

export function taskQueueSize(queue: QueuedTaskRows): number {
  return Object.keys(queue.projects).length + Object.keys(queue.tags).length + Object.keys(queue.tasks).length;
}

export async function clearQueues(userId: string): Promise<void> {
  await Promise.all([del(actionsKey(userId)), del(sessionsKey(userId)), del(tasksKey(userId))]);
}
