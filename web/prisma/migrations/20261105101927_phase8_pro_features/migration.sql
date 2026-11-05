-- DropIndex
DROP INDEX "Note_userId_idx";

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "serverUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "ambientMix" JSONB,
ADD COLUMN     "focusSoundId" TEXT,
ADD COLUMN     "longBreakSoundId" TEXT,
ADD COLUMN     "shortBreakSoundId" TEXT;

-- CreateIndex
CREATE INDEX "Note_userId_serverUpdatedAt_idx" ON "Note"("userId", "serverUpdatedAt");
