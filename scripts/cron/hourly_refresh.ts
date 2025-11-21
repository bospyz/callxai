/**
 * Ежечасный cron-скрипт (заглушка).
 *
 * TODO (позже):
 *  - пройтись по всем компаниям
 *  - обновить токены amoCRM (refreshToken -> accessToken)
 *  - запустить retry для звонков в статусе ERROR
 *  - подготовить ежедневные агрегаты/отчёты
 */

async function main() {
  console.log("[Cron] hourly_refresh stub started");

  // TODO:
  // import { refreshAllAmoTokens } from "@/lib/amocrm";
  // await refreshAllAmoTokens();
  //
  // import { retryFailedCalls } from "@/lib/workers/retry-queue";
  // await retryFailedCalls();

  console.log("[Cron] hourly_refresh stub finished");
}

main().catch((err) => {
  console.error("[Cron] hourly_refresh failed", err);
  process.exit(1);
});
