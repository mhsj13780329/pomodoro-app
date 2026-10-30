/*
  Phase 5: tasks sync.

  - Drops Task.recurrence (recurring tasks are not part of the app).
  - Adds updatedAt (client edit time, last-write-wins), deletedAt (soft delete) and
    serverUpdatedAt (pull cursor) to Task, Project and Tag.
  - serverUpdatedAt is added with a temporary default so rows that already exist get a
    value; the default is dropped again because Prisma sets @updatedAt itself.
  - Tag loses its (userId, name) unique index: offline devices can create the same name.
*/
-- DropIndex
DROP INDEX "Project_userId_idx";

-- DropIndex
DROP INDEX "Tag_userId_name_key";

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "serverUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Project" ALTER COLUMN "serverUpdatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Tag" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "serverUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Tag" ALTER COLUMN "serverUpdatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "recurrence",
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "serverUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Task" ALTER COLUMN "serverUpdatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Project_userId_serverUpdatedAt_idx" ON "Project"("userId", "serverUpdatedAt");

-- CreateIndex
CREATE INDEX "Tag_userId_serverUpdatedAt_idx" ON "Tag"("userId", "serverUpdatedAt");

-- CreateIndex
CREATE INDEX "Task_userId_serverUpdatedAt_idx" ON "Task"("userId", "serverUpdatedAt");
