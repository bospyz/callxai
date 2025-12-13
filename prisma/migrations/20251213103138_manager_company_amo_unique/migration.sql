/*
  Warnings:

  - A unique constraint covering the columns `[companyId,amoUserId]` on the table `Manager` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Manager_companyId_amoUserId_key" ON "Manager"("companyId", "amoUserId");
