// The two directions between a TimerAction and the wire TimerCommand, side by side so
// they cannot drift apart. No server-only imports: the store and the server both use it.

import type { TimerCommand } from "@/lib/sync/contract";
import type { TimerAction } from "./transitions";

/** What the client sends for an action it just applied at `expectedVersion`. */
export function actionToCommand(action: TimerAction, expectedVersion: number): TimerCommand {
  switch (action.type) {
    case "start":
      return { action: "start", expectedVersion, runId: action.runId };
    case "select":
      return { action: "select", expectedVersion, phase: action.phase };
    case "complete":
      return { action: "complete", expectedVersion, runId: action.nextRunId };
    case "pause":
    case "resume":
    case "skip":
    case "reset":
      return { action: action.type, expectedVersion };
    default: {
      const _never: never = action;
      return _never;
    }
  }
}

/** What the server applies. A `complete` that carries no runId gets a fresh one minted here. */
export function commandToAction(command: TimerCommand): TimerAction {
  switch (command.action) {
    case "start":
      return { type: "start", runId: command.runId };
    case "select":
      return { type: "select", phase: command.phase };
    case "complete":
      return { type: "complete", nextRunId: command.runId ?? crypto.randomUUID() };
    case "pause":
    case "resume":
    case "skip":
    case "reset":
      return { type: command.action };
    default: {
      const _never: never = command;
      return _never;
    }
  }
}
