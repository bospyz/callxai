// src/lib/call-processing.ts

import { db } from "@/lib/db";
import { CallStatus } from "@prisma/client";

/**
 * Обработка одного звонка по ID.
 * Сейчас — заглушка без OpenAI: просто пишет фиктивный транскрипт и score.
 * Позже сюда можно подключить реальный анализ (call-analysis.ts).
 */
export async function processSingleCall(callId: string) {
  // 1. Берём звонок
  const call = await db.call.findUnique({
    where: { id: callId },
  });

  if (!call) {
    throw new Error(`Call ${callId} not found`);
  }

  if (call.status !== CallStatus.NEW) {
    // Уже обработан или в процессе — пропускаем
    return {
      ok: false,
      skipped: true,
      reason: `Call status is ${call.status}, expected NEW`,
    };
  }

  // 2. Помечаем как PROCESSING
  await db.call.update({
    where: { id: callId },
    data: {
      status: CallStatus.PROCESSING,
    },
  });

  try {
    // === ТУТ В БУДУЩЕМ БУДЕТ РЕАЛЬНЫЙ АНАЛИЗ ===
    // можно будет вызвать что-то типа runCallAnalysis(call) из call-analysis.ts

    const fakeTranscript = `Test transcript for call ${call.id}`;
    const fakeScore = 80;

    await db.call.update({
      where: { id: callId },
      data: {
        status: CallStatus.DONE,
        transcript: fakeTranscript,
        score: fakeScore,
        meta: {
          ...(call.meta ?? {}),
          processedBy: "stub-processor",
          processedAt: new Date().toISOString(),
        },
      },
    });

    return {
      ok: true,
      skipped: false,
    };
  } catch (err) {
    console.error("[processSingleCall] Error:", err);

    await db.call.update({
      where: { id: callId },
      data: {
        status: CallStatus.ERROR,
        meta: {
          ...(call.meta ?? {}),
          processedBy: "stub-processor",
          processedAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        },
      },
    });

    return {
      ok: false,
      skipped: false,
    };
  }
}

/**
 * Обрабатываем пачку звонков со статусом NEW.
 */
export async function processNewCallsBatch(limit: number = 10) {
  // Берём первые N звонков со статусом NEW
  const calls = await db.call.findMany({
    where: { status: CallStatus.NEW },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  if (calls.length === 0) {
    return {
      ok: true,
      total: 0,
      processed: 0,
      skipped: 0,
    };
  }

  let processed = 0;
  let skipped = 0;

  for (const c of calls) {
    const result = await processSingleCall(c.id);

    if (result.skipped) skipped += 1;
    else if (result.ok) processed += 1;
  }

  return {
    ok: true,
    total: calls.length,
    processed,
    skipped,
  };
}
