// Finds accounts whose Pro ends in 3 local days, or ended yesterday, and sends one reminder.
// The same proUntil is never reminded twice: the row's unique key is (user, proUntil, kind).
// A renewal changes proUntil, so the new date can be reminded.
//
//   npx tsx scripts/send-expiry-reminders.ts
//
// Dev only logs the message. Phase 10 plugs in a real SMS provider and mailer.
import { config } from "dotenv";

config({ path: ".env.local" });

function alreadySent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "P2002";
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { logNotifier } = await import("../src/lib/payments/notifier");
  const { reminderKind, reminderTarget } = await import("../src/lib/payments/reminders");
  const { reminderText } = await import("../src/lib/payments/reminder-copy");
  const notifier = logNotifier();
  const now = new Date();

  const users = await prisma.user.findMany({
    where: { proLifetime: { not: true }, proUntil: { not: null } },
    select: {
      id: true,
      email: true,
      phoneNumber: true,
      locale: true,
      timezone: true,
      proUntil: true,
    },
  });

  let sent = 0;
  let skipped = 0;

  for (const user of users) {
    if (!user.proUntil) continue;
    const kind = reminderKind(user.proUntil, user.timezone || "Asia/Tehran", now);
    if (!kind) continue;
    const target = reminderTarget({ phoneNumber: user.phoneNumber, email: user.email });
    if (!target) continue;

    // Insert first. A second run hits the unique key and does not send again.
    try {
      await prisma.proReminder.create({
        data: {
          userId: user.id,
          proUntil: user.proUntil,
          kind,
          channel: target.channel,
        },
      });
    } catch (error) {
      if (alreadySent(error)) {
        skipped += 1;
        continue;
      }
      throw error;
    }

    const body = reminderText(user.locale, kind);
    try {
      if (target.channel === "SMS") await notifier.sendSms(target.to, body);
      else await notifier.sendEmail(target.to, body);
      sent += 1;
    } catch (error) {
      // The send failed, so the row should not block tomorrow's retry.
      await prisma.proReminder.deleteMany({
        where: { userId: user.id, proUntil: user.proUntil, kind },
      });
      throw error;
    }
  }

  console.log(`Expiry reminders: ${sent} sent, ${skipped} already sent.`);
  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
