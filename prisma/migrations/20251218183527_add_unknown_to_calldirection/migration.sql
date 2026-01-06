/*
  Warnings:

  - The values [UNKNOWN] on the enum `CallDirection` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the `CronLock` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "CallDirection_new" AS ENUM ('INBOUND', 'OUTBOUND');
ALTER TABLE "Call" ALTER COLUMN "direction" TYPE "CallDirection_new" USING ("direction"::text::"CallDirection_new");
ALTER TYPE "CallDirection" RENAME TO "CallDirection_old";
ALTER TYPE "CallDirection_new" RENAME TO "CallDirection";
DROP TYPE "public"."CallDirection_old";
COMMIT;

-- DropTable
DROP TABLE "CronLock";
