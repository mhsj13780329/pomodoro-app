-- Payment rows are created before Zarinpal returns an authority, so authority is nullable
-- and unique (the callback looks the row up by it). locale is the pricing page's locale,
-- because the callback URL is not under /fa or /en. EXPIRED is an abandoned PENDING row.
-- ProReminder's unique key is one reminder per user, expiry instant, and kind.

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('EXPIRING', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('SMS', 'EMAIL');

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'EXPIRED';

-- DropIndex
DROP INDEX "Payment_userId_idx";

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "cardPan" TEXT,
ADD COLUMN     "errorCode" INTEGER,
ADD COLUMN     "locale" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "authority" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ProReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "proUntil" TIMESTAMP(3) NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProReminder_userId_idx" ON "ProReminder"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProReminder_userId_proUntil_kind_key" ON "ProReminder"("userId", "proUntil", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_authority_key" ON "Payment"("authority");

-- CreateIndex
CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ProReminder" ADD CONSTRAINT "ProReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
