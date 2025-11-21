// src/lib/analytics/AnalyticsService.ts

import { CallStatus } from "@prisma/client";
import { db } from "../db";

export type CompanyAnalytics = {
  totalCalls: number;
  doneCalls: number;
  errorCalls: number;
  processingCalls: number;
  avgScore: number | null;
};

export async function getCompanyAnalytics(
  companyId: string,
  days: number = 30
): Promise<CompanyAnalytics> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const calls = await db.call.findMany({
    where: {
      companyId,
      createdAt: { gte: since },
    },
    select: {
      status: true,
      score: true,
    },
  });

  const total = calls.length;

  let done = 0;
  let error = 0;
  let processing = 0;
  let sumScore = 0;
  let scoredCount = 0;

  for (const c of calls) {
    if (c.status === CallStatus.DONE) done++;
    if (c.status === CallStatus.ERROR) error++;
    if (c.status === CallStatus.PROCESSING || c.status === CallStatus.NEW) {
      processing++;
    }
    if (typeof c.score === "number") {
      sumScore += c.score;
      scoredCount++;
    }
  }

  const avgScore = scoredCount > 0 ? sumScore / scoredCount : null;

  return {
    totalCalls: total,
    doneCalls: done,
    errorCalls: error,
    processingCalls: processing,
    avgScore,
  };
}
