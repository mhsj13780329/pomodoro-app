import { prisma } from "@/lib/prisma";
import { writeTimer } from "@/lib/sync/rows";
import { buildPayload, isDue } from "./payload";
import { pushEnabled, sendToUser } from "./send";

const INTERVAL_MS = 5_000;

/**
 * One pass: complete every running phase that has ended for a user with a push subscription,
 * using the same command a client would send. The version in the command is the lock: if a
 * device completed first, one side gets a conflict and nothing is pushed twice.
 */
export async function sweepOnce(now = Date.now()): Promise<number> {
  const rows = await prisma.activeTimer.findMany({
    where: {
      status: "RUNNING",
      startedAt: { lte: new Date(now) },
      user: { pushSubscriptions: { some: {} } },
    },
    include: { user: { select: { locale: true } } },
  });

  let pushed = 0;
  for (const row of rows) {
    if (!isDue(row, now)) continue;
    try {
      const result = await writeTimer(row.userId, { action: "complete", expectedVersion: row.version }, now);
      // "early" and "conflict" mean someone else moved it or it is not over yet; stay silent.
      if (result.kind !== "ok" || result.state.activeTimer.version === row.version) continue;
      const settings = await prisma.settings.findUnique({
        where: { userId: row.userId },
        select: { notificationsOn: true },
      });
      if (settings && !settings.notificationsOn) continue;
      const next = result.state.activeTimer;
      await sendToUser(row.userId, buildPayload(row.user.locale, next.phase, next.status));
      pushed += 1;
    } catch (error) {
      console.error("push sweep failed for a user", error);
    }
  }
  return pushed;
}

const globalForSweeper = globalThis as unknown as { pushSweeperStarted?: boolean };

/** Starts the loop once per process. A dev reload does not start a second one. */
export function startSweeper(): void {
  if (globalForSweeper.pushSweeperStarted || !pushEnabled()) return;
  globalForSweeper.pushSweeperStarted = true;
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    sweepOnce()
      .catch((error) => console.error("push sweep failed", error))
      .finally(() => {
        running = false;
      });
  }, INTERVAL_MS);
  timer.unref?.();
}
