// src/lib/call-processing.ts
import { db } from "@/lib/db";
import { CallStatus } from "@prisma/client";
import { processCall } from "@/lib/call-analysis";

export type ProcessBatchResult = {
  total: number;
  processed: number;
  skipped: number;
  errors: { callId: string; message: string }[];
};

/**
 * Обрабатывает пачку звонков в статусе NEW.
 * Простая версия без распределения по воркерам/очередям.
 *
 * Используется, например, из cron-ручки /api/cron/process-calls.
 */
export async function processNewCallsBatch(
  limit: number = 10
): Promise<ProcessBatchResult> {
  const calls = await db.call.findMany({
    where: {
      status: CallStatus.NEW,
    },
    orderBy: {
      createdAt: "asc",
    },
    take: limit,
  });

  const total = calls.length;
  let processed = 0;
  let skipped = 0;
  const errors: { callId: string; message: string }[] = [];

  for (const call of calls) {
    // если нет ни локального audioUrl, ни внешнего audioUrlExternal — помечаем ERROR и скипаем
    const hasAudio = !!call.audioUrl || !!(call as any).audioUrlExternal;

    if (!hasAudio) {
      skipped += 1;
      await db.call.update({
        where: { id: call.id },
        data: {
          status: CallStatus.ERROR,
          meta: {
            ...(call.meta as any),
            error: "Missing audioUrl/audioUrlExternal for call",
          },
        },
      });
      continue;
    }

    try {
      await processCall(call.id);
      processed += 1;
    } catch (err: any) {
      const message = err?.message ?? String(err ?? "Unknown error");
      errors.push({ callId: call.id, message });

      try {
        await db.call.update({
          where: { id: call.id },
          data: {
            status: CallStatus.ERROR,
            meta: {
              ...(call.meta as any),
              error: message,
            },
          },
        });
      } catch (updateErr) {
        console.error(
          "[call-processing] Failed to update call after error",
          updateErr
        );
      }
    }
  }

  return { total, processed, skipped, errors };
}
