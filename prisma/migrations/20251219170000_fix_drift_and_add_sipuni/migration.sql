-- 1) Ensure enum CallDirection has UNKNOWN
ALTER TYPE "CallDirection" ADD VALUE IF NOT EXISTS 'UNKNOWN';

-- 2) Ensure enum IntegrationType has SIPUNI
ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'SIPUNI';

-- 3) Ensure CronLock table exists
CREATE TABLE IF NOT EXISTS "CronLock" (
  "key" TEXT NOT NULL,
  "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CronLock_pkey" PRIMARY KEY ("key")
);

-- 4) Ensure index exists
CREATE INDEX IF NOT EXISTS "CronLock_expiresAt_idx" ON "CronLock"("expiresAt");
