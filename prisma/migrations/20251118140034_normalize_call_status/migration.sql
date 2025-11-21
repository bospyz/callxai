/*
  Warnings:

  - The values [PENDING,IN_PROGRESS,FAILED] on the enum `CallStatus` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[companyId,externalId]` on the table `Call` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[companyId,type]` on the table `Integration` will be added. If there are existing duplicate values, this will fail.

*/
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

-- DropIndex
DROP INDEX "Integration_companyId_type_idx";

-- AlterTable
ALTER TABLE "Call" ALTER COLUMN "status" SET DEFAULT 'NEW';

-- CreateIndex
CREATE INDEX "Call_externalId_idx" ON "Call"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Call_companyId_externalId_key" ON "Call"("companyId", "externalId");

-- CreateIndex
CREATE INDEX "Company_name_idx" ON "Company"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_companyId_type_key" ON "Integration"("companyId", "type");
