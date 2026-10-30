// Not marked `server-only`: scripts/reconcile-payments.ts imports this in plain Node,
// the same reason prisma.ts is not. Client components must not import it.
import { prisma } from "@/lib/prisma";
import type { ProColumns } from "./extend-pro";
import type { GrantLock, PaidWrite } from "./settle";

/**
 * Locks this payment, then the user, until the transaction ends.
 * Two callbacks (a refresh, or the reconcile script at the same time) then run
 * one after the other. The second one sees PAID and does not add the days again.
 * The user lock is there so two different payments cannot both read the same
 * proUntil and each add a year from it.
 */
export function prismaGrantLock(): GrantLock {
  return {
    async once(paymentId, write) {
      return prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ status: string; userId: string }>>`
          SELECT "status", "userId" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE
        `;
        const payment = locked[0];
        if (!payment) return "already_paid";
        if (payment.status === "PAID") return "already_paid";

        await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${payment.userId} FOR UPDATE`;
        const user = await tx.user.findUnique({
          where: { id: payment.userId },
          select: { proUntil: true, proLifetime: true },
        });
        const current: ProColumns = {
          proUntil: user?.proUntil ?? null,
          proLifetime: user?.proLifetime === true,
        };
        const next: PaidWrite = write(current);
        // Status, receipt and Pro move together. A crash rolls all of them back.
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: "PAID",
            refId: next.refId,
            cardPan: next.cardPan,
            verifiedAt: next.verifiedAt,
            errorCode: null,
          },
        });
        await tx.user.update({
          where: { id: payment.userId },
          data: { proUntil: next.user.proUntil, proLifetime: next.user.proLifetime },
        });
        return "granted";
      });
    },
  };
}

/** Marks a checkout failed unless it was already paid. A late success must not be overwritten. */
export async function markPaymentFailed(paymentId: string, errorCode: number | null): Promise<void> {
  await setStatusUnlessPaid(paymentId, "FAILED", errorCode);
}

/**
 * An old PENDING row that will never be paid. Leaves PAID and FAILED rows alone,
 * so running the reconcile script twice does not change a finished payment.
 */
export async function expirePayment(paymentId: string, errorCode: number | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT "status" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE
    `;
    if (locked[0]?.status !== "PENDING") return;
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: "EXPIRED", errorCode },
    });
  });
}

async function setStatusUnlessPaid(paymentId: string, status: "FAILED", errorCode: number | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT "status" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE
    `;
    if (locked[0]?.status === "PAID") return;
    await tx.payment.update({
      where: { id: paymentId },
      data: { status, errorCode },
    });
  });
}
