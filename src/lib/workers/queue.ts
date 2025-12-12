// src/lib/workers/queue.ts

import { CallStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { processCall } from "@/lib/call-analysis";
import { logError, logInfo } from "@/lib/logger/Sentry";

export type CallJob = {
  callId: string;
};

let queue: CallJob[] = [];
let isProcessing = false;

/**
 * Добавляет звонок в очередь обработки HYPERFLOW:
 * download → transcribe → analyze → DONE.
 */
export async function enqueueCallProcessing(job: CallJob): Promise<void> {
  queue.push(job);

  logInfo("enqueueCallProcessing", {
    context: "call-queue.enqueue",
    extra: {
      callId: job.callId,
      queueSize: queue.length,
    },
  });

  if (!isProcessing) {
    void processNext();
  }
}

/**
 * Обрабатывает следующий звонок из очереди.
 * Простая in-memory очередь в пределах одного процесса.
 */
async function processNext(): Promise<void> {
  if (isProcessing) return;
  if (queue.length === 0) return;

  isProcessing = true;

  const job = queue.shift();
  if (!job) {
    isProcessing = false;
    return;
  }

  const { callId } = job;

  logInfo("Processing call from queue", {
    context: "call-queue.processNext",
    extra: { callId },
  });

  try {
    // помечаем звонок как PROCESSING
    await db.call.update({
      where: { id: callId },
      data: {
        status: CallStatus.PROCESSING,
      },
    });

    // основной AI-пайплайн
    await processCall(callId);
  } catch (err: any) {
    logError(err, {
      context: "call-queue.processNext",
      extra: { callId },
    });

    const message = String(err?.message || err || "Unknown error");

    try {
      // достаём текущее meta, чтобы не затирать существующие поля
      const existing = await db.call.findUnique({
        where: { id: callId },
        select: { meta: true },
      });

      await db.call.update({
        where: { id: callId },
        data: {
          status: CallStatus.ERROR,
          meta: {
            ...(existing?.meta as any),
            error: message,
          },
        },
      });
    } catch (updateErr) {
      logError(updateErr, {
        context: "call-queue.markError",
        extra: { callId },
      });
    }
  } finally {
    isProcessing = false;

    // если в очереди ещё есть задачи — продолжаем
    if (queue.length > 0) {
      void processNext();
    }
  }
}
