export type SyncView =
  | { kind: "guest" }
  | { kind: "synced" }
  | { kind: "syncing" }
  | { kind: "offline"; waiting: number };

let view: SyncView = { kind: "guest" };
const listeners = new Set<() => void>();

export function syncView(): SyncView {
  return view;
}

export function setSyncView(next: SyncView) {
  view = next;
  for (const listener of listeners) listener();
}

export function subscribeSync(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A finished focus is one waiting item, even though it is also a timer action. */
export function waitingCountOf(
  actions: readonly { action: string }[],
  sessions: readonly unknown[],
  /** Task, project and tag rows waiting to upload. */
  taskRows = 0,
): number {
  return sessions.length + taskRows + actions.filter((action) => action.action !== "complete").length;
}
