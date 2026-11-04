import "server-only";
import { loadEntitlement } from "@/lib/entitlement";
import { prisma } from "@/lib/prisma";
import { isProActive } from "@/lib/pro";
import { storeSessions } from "@/lib/sync/rows";
import { importGuestTasks } from "@/lib/tasks/rows";
import type { ImportBody, ImportResult, ImportSettings } from "./contract";
import { decideSettingsImport } from "./merge";

/** Copies the guest settings only when the account has none. Rechecked inside the transaction. */
async function importGuestSettings(userId: string, settings: ImportSettings): Promise<boolean> {
  const first = await prisma.settings.findUnique({ where: { userId }, select: { userId: true } });
  if (!decideSettingsImport(first != null, settings)) return false;
  return prisma.$transaction(async (tx) => {
    // Check again so a retry does not overwrite settings another request just created.
    const row = await tx.settings.findUnique({ where: { userId }, select: { userId: true } });
    if (!decideSettingsImport(row != null, settings)) return false;
    await tx.settings.create({ data: { userId, ...settings } });
    return true;
  });
}

/**
 * Uploads what a guest made on this device: settings, then tasks, then sessions (so a session
 * can point at an imported task). Each step goes through the same writer as the normal API,
 * so the same limits and checks apply.
 *
 * The steps are not one transaction. That is fine: every step is idempotent by id, and the
 * client keeps the data and retries the whole upload on any failure (it marks "imported" only
 * after a 200). A partial run followed by a retry ends in the same state as one clean run.
 */
export async function importGuest(userId: string, body: ImportBody, serverNow: number): Promise<ImportResult> {
  const importedSettings = await importGuestSettings(userId, body.settings);
  const pro = isProActive(await loadEntitlement(userId));
  const tasks = await importGuestTasks(userId, body.tasks, pro);
  // Rejected sessions are dropped silently, as /api/sessions does.
  const sessions = await storeSessions(userId, body.sessions, serverNow);
  return {
    ok: true,
    importedSettings,
    importedSessions: sessions.accepted.length,
    importedTasks: tasks.imported,
    skippedTasks: tasks.skipped,
  };
}
