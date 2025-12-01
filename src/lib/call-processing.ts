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
 * Простая версия без сложного распределения по воркерам.
 */
export async function processNewCallsBatch(
  limit: number = 10
): Promise<ProcessBatchResult> {
  const newCalls = await db.call.findMany({
    where: {
      status: CallStatus.NEW,
    },
    orderBy: {
      createdAt: "asc",
    },
    take: limit,
  });

  const total = newCalls.length;
  let processed = 0;
  let skipped = 0;
  const errors: { callId: string; message: string }[] = [];

  for (const call of newCalls) {
    try {
      // Отмечаем как PROCESSING, чтобы не схватили другие воркеры/cron
      await db.call.update({
        where: { id: call.id },
        data: {
          status: CallStatus.PROCESSING,
        },
      });

      await processCall(call.id);
      processed += 1;
    } catch (err: any) {
      const message = String(err?.message || err);
      errors.push({ callId: call.id, message });

      try {
        await db.call.update({
          where: { id: call.id },
          data: {
            status: CallStatus.ERROR,
            meta: {
              // meta у нас типа Json, поэтому явно приводим к any,
              // чтобы не было TS-ошибки "Spread types may only be created from object types"
              ...((call.meta ?? {}) as any),
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
