// Re-check PENDING checkouts that the buyer's browser never finished.
// Safe to run over and over: a paid row is granted once, and a row that cannot
// be verified becomes EXPIRED and is skipped the next time.
//
//   npx tsx scripts/reconcile-payments.ts
//
// Cron can call this later. A Zarinpal hiccup (network, -52, -12) leaves the row PENDING.
import { config } from "dotenv";

config({ path: ".env.local" });

const CUTOFF_MS = 15 * 60 * 1000;

async function main() {
  // Loaded after dotenv, so Prisma sees DATABASE_URL. These modules share the
  // callback's verify-and-grant path, including the row lock.
  const { prisma } = await import("../src/lib/prisma");
  const { expirePayment, prismaGrantLock } = await import("../src/lib/payments/grant-db");
  const { isPlanId } = await import("../src/lib/payments/plans");
  const { reconcileDecision, verifyAndGrant } = await import("../src/lib/payments/settle");
  const { getPaymentGateway, ZarinpalUnavailable } = await import("../src/lib/payments/zarinpal");

  const cutoff = new Date(Date.now() - CUTOFF_MS);
  const rows = await prisma.payment.findMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    select: { id: true, plan: true, amountToman: true, authority: true },
  });

  let settled = 0;
  let expired = 0;
  let kept = 0;
  const gateway = rows.some((row) => row.authority) ? getPaymentGateway() : null;

  for (const row of rows) {
    if (!row.authority || !isPlanId(row.plan) || !gateway) {
      await expirePayment(row.id, null);
      expired += 1;
      continue;
    }

    try {
      const result = await verifyAndGrant({
        gateway,
        lock: prismaGrantLock(),
        payment: {
          id: row.id,
          amountToman: row.amountToman,
          authority: row.authority,
          plan: row.plan,
        },
        now: new Date(),
      });
      const outcome = result.kind === "success" ? "paid" : result.kind === "failed" ? "definitive" : "transient";
      const decision = reconcileDecision(row.authority, outcome);
      if (decision === "expire" && result.kind === "failed") {
        await expirePayment(row.id, result.code);
        expired += 1;
      } else if (decision === "settle") {
        settled += 1;
      } else {
        kept += 1;
      }
    } catch (error) {
      if (!(error instanceof ZarinpalUnavailable)) throw error;
      kept += 1;
    }
  }

  console.log(
    `Reconciled ${rows.length} old pending payments: ${settled} granted, ${expired} expired, ${kept} left pending.`,
  );
  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
