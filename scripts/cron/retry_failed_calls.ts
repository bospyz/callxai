// scripts/cron/retry_failed_calls.ts

import { PrismaClient, CallStatus } from "@prisma/client";
import { retryFailedCallsForCompany } from "@/lib/workers/retry-queue";

const prisma = new PrismaClient();

/**
 * Скрипт для периодического ретрая ERROR-звонков.
 * Можно запускать раз в час/день через cron / планировщик.
 */
async function main() {
  console.log("[Cron] retry_failed_calls started");

  // Находим все компании, у которых есть ERROR-звонки
  const companiesWithErrors = await prisma.call.findMany({
    where: {
      status: CallStatus.ERROR,
    },
    select: {
      companyId: true,
    },
    distinct: ["companyId"],
  });

  if (companiesWithErrors.length === 0) {
    console.log("[Cron] no ERROR calls found, nothing to retry");
    return;
  }

  for (const row of companiesWithErrors) {
    const companyId = row.companyId;
    if (!companyId) continue;

    try {
      const result = await retryFailedCallsForCompany(companyId, 50);
      console.log(
        `[Cron] company=${companyId} retried=${result.retried} ERROR calls`
      );
    } catch (err) {
      console.error(
        `[Cron] failed to retry ERROR calls for company=${companyId}`,
        err
      );
    }
  }

  console.log("[Cron] retry_failed_calls finished");
}

main()
  .catch((err) => {
    console.error("[Cron] retry_failed_calls fatal error", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
