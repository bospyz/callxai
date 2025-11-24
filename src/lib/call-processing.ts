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

export async function processNewCallsBatch(
  limit: number = 10
): Promise<ProcessBatchResult> {
  // сколько всего NEW в базе
  const total = await db.call.count({
    where: { status: CallStatus.NEW },
  });

  if (total === 0) {
    return { total, processed: 0, skipped: 0, errors: [] };
  }

  // берём первые N NEW
  const calls = await db.call.findMany({
    where: { status: CallStatus.NEW },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let processed = 0;
  let skipped = 0;
  const errors: { callId: string; message: string }[] = [];

  for (const call of calls) {
    try {
      // помечаем как PROCESSING, чтобы не схватил второй воркер
      await db.call.update({
        where: { id: call.id },
        data: { status: CallStatus.PROCESSING },
      });

      // основная магия — внутри уже делается транскрипт + анализ
      await processCall(call.id);

      processed += 1;
    } catch (err: any) {
      const message = err?.message ?? String(err);
      console.error("[processNewCallsBatch] error for call", call.id, message);

      skipped += 1;
      errors.push({ callId: call.id, message });

      // помечаем ошибку на самой записи
      await db.call.update({
        where: { id: call.id },
        data: {
          status: CallStatus.ERROR,
          meta: {
            ...(call.meta ?? {}),
            error: message,
          },
        },
      });
    }
  }

  return { total, processed, skipped, errors };
}
