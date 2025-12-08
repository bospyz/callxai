/*
  Warnings:

  - The values [PENDING] on the enum `CallStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "CallTaskStatus" AS ENUM ('NEW', 'PROCESSING', 'DONE', 'ERROR');

-- AlterEnum
BEGIN;
CREATE TYPE "CallStatus_new" AS ENUM ('NEW', 'PROCESSING', 'DONE', 'ERROR');
ALTER TABLE "public"."Call" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Call" ALTER COLUMN "status" TYPE "CallStatus_new" USING ("status"::text::"CallStatus_new");
ALTER TYPE "CallStatus" RENAME TO "CallStatus_old";
ALTER TYPE "CallStatus_new" RENAME TO "CallStatus";
DROP TYPE "public"."CallStatus_old";
ALTER TABLE "Call" ALTER COLUMN "status" SET DEFAULT 'NEW';
COMMIT;

-- CreateTable
CREATE TABLE "CallTask" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "callId" TEXT NOT NULL,
    "status" "CallTaskStatus" NOT NULL DEFAULT 'NEW',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CallTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CallTask_status_createdAt_idx" ON "CallTask"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "CallTask" ADD CONSTRAINT "CallTask_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;
