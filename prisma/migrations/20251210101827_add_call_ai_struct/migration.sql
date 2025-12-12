-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- AlterTable
ALTER TABLE "Call" ADD COLUMN     "amountKzt" INTEGER,
ADD COLUMN     "audioUrlExternal" TEXT,
ADD COLUMN     "clientPhone" TEXT,
ADD COLUMN     "direction" "CallDirection",
ADD COLUMN     "leadId" TEXT,
ADD COLUMN     "leadName" TEXT,
ADD COLUMN     "leadUrl" TEXT,
ADD COLUMN     "linePhone" TEXT,
ADD COLUMN     "occurredAt" TIMESTAMP(3),
ADD COLUMN     "pipelineId" TEXT,
ADD COLUMN     "pipelineName" TEXT,
ADD COLUMN     "stageId" TEXT,
ADD COLUMN     "stageName" TEXT;

-- AlterTable
ALTER TABLE "Manager" ADD COLUMN     "amoUserId" TEXT;

-- CreateTable
CREATE TABLE "CallScore" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "callId" TEXT NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "greetingScore" INTEGER,
    "reactionScore" INTEGER,
    "empathyScore" INTEGER,
    "needsScore" INTEGER,
    "presentationScore" INTEGER,
    "priceScore" INTEGER,
    "objectionsScore" INTEGER,
    "closingScore" INTEGER,
    "clarityScore" INTEGER,
    "talkRatioManager" DOUBLE PRECISION,
    "lengthScore" INTEGER,
    "summary" TEXT,
    "issues" JSONB,
    "details" JSONB,

    CONSTRAINT "CallScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallTranscript" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "callId" TEXT NOT NULL,
    "rawTranscript" TEXT,
    "structured" JSONB,

    CONSTRAINT "CallTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CallScore_callId_key" ON "CallScore"("callId");

-- CreateIndex
CREATE UNIQUE INDEX "CallTranscript_callId_key" ON "CallTranscript"("callId");

-- CreateIndex
CREATE INDEX "Call_occurredAt_idx" ON "Call"("occurredAt");

-- CreateIndex
CREATE INDEX "Call_leadId_idx" ON "Call"("leadId");

-- CreateIndex
CREATE INDEX "Manager_companyId_amoUserId_idx" ON "Manager"("companyId", "amoUserId");

-- AddForeignKey
ALTER TABLE "CallScore" ADD CONSTRAINT "CallScore_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallTranscript" ADD CONSTRAINT "CallTranscript_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;
