 // scripts/cron/sync_amocrm_recent_calls.ts

import { PrismaClient, IntegrationType } from "@prisma/client";
import { syncAmoRecentCalls } from "@/lib/amocrm-sync";

const prisma = new PrismaClient();

/**
 * Cron-скрипт:
 *  - ищет все включённые AMO-интеграции
 *  - для каждой компании дёргает syncAmoRecentCalls({ companyId, limit })
 */
async function main() {
  console.log("[Cron] sync_amocrm_recent_calls started");

  const integrations = await prisma.integration.findMany({
    where: {
      type: IntegrationType.AMOCRM,
      enabled: true,
    },
    select: {
      id: true,
      companyId: true,
    },
  });

  if (integrations.length === 0) {
    console.log("[Cron] no AMO integrations found");
    return;
  }

  for (const integration of integrations) {
    if (!integration.companyId) continue;

    try {
 const res = await syncAmoRecentCalls({
  companyId: integration.companyId,
  limit: 100,
  days: 7,
  skipShort: false,
  minDurationSec: 0,
});


      console.log(
        `[Cron] company=${integration.companyId} -> ok=${res.ok} created=${res.created} msg="${res.message}"`
      );
    } catch (err) {
      console.error(
        `[Cron] failed to sync amo calls for company=${integration.companyId}`,
        err
      );
    }
  }

  console.log("[Cron] sync_amocrm_recent_calls finished");
}

main()
  .catch((err) => {
    console.error("[Cron] fatal error", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
