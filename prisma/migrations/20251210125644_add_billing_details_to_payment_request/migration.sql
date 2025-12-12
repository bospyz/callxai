/*
  Warnings:

  - Added the required column `billingDetails` to the `PaymentRequest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PaymentRequest" ADD COLUMN     "billingDetails" TEXT NOT NULL,
ADD COLUMN     "comment" TEXT;
