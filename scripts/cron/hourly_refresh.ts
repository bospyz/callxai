import { refreshAllAmoTokens } from "@/lib/amocrm";
import { retryAllFailedCalls } from "@/lib/workers/retry-queue";

/**
 * Ежечасный cron-скрипт.
 *
 * - обновляет токены amoCRM
 * - перезапускает обработку звонков в статусе ERROR
 */
async function main() {
  console.log("[Cron] hourly_refresh started");

  await refreshAllAmoTokens();

  try {
    await retryAllFailedCalls();
  } catch (err) {
    console.error("[Cron] retryAllFailedCalls error", err);
  }

  console.log("[Cron] hourly_refresh finished");
}

main().catch((err) => {
  console.error("[Cron] hourly_refresh failed", err);
  process.exit(1);
});
