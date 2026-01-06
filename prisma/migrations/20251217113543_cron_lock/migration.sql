-- AlterEnum
ALTER TYPE "CallDirection" ADD VALUE 'UNKNOWN';

-- CreateTable
CREATE TABLE "CronLock" (
    "key" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CronLock_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "CronLock_expiresAt_idx" ON "CronLock"("expiresAt");
