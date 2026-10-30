/*
  Warnings:

  - The required column `runId` was added to the `ActiveTimer` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterEnum
ALTER TYPE "TimerStatus" ADD VALUE 'IDLE';

-- AlterTable
ALTER TABLE "ActiveTimer" ADD COLUMN     "runId" TEXT NOT NULL,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;
