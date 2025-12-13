/*
  Warnings:

  - A unique constraint covering the columns `[callId]` on the table `CallTask` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Manager_companyId_amoUserId_idx";

-- AlterTable
ALTER TABLE "CallTask" ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "nextRunAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "CallTask_callId_key" ON "CallTask"("callId");

-- CreateIndex
CREATE INDEX "CallTask_status_nextRunAt_idx" ON "CallTask"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "CallTask_lockedAt_idx" ON "CallTask"("lockedAt");
