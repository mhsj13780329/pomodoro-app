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
  // Loaded after dotenv, so Prisma sees DATABASE_URL.
  const { prisma } = await import("../src/lib/prisma");
  const { createCheckout } = await import("../src/lib/payments/checkout");
  const { lazyGateway } = await import("../src/lib/payments/payment-setup");

  try {
    const olderThan = new Date(Date.now() - CUTOFF_MS);
    const { settled, expired, kept } = await createCheckout({ gateway: lazyGateway() }).reconcilePending({ olderThan });
    console.log(
      `Reconciled ${settled + expired + kept} old pending payments: ${settled} granted, ${expired} expired, ${kept} left pending.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
