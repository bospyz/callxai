// src/lib/workers/queue.ts

import { CallStatus } from "@prisma/client";
import { db } from "../db";
import { processCall } from "../call-analysis";
import { logError, logInfo } from "../logger/Sentry";

export type CallJob = {
  callId: string;
};

let queue: CallJob[] = [];
let isProcessing = false;

/**
 * Добавляет звонок в очередь обработки.
 */
export async function enqueueCallProcessing(job: CallJob): Promise<void> {
  queue.push(job);
  logInfo("enqueueCallProcessing", {
    context: "call-queue.enqueue",
    extra: { callId: job.callId, queueSize: queue.length },
  });

  if (!isProcessing) {
    void processNext();
  }
}

async function processNext() {
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

    await processCall(callId);
  } catch (err: any) {
    logError(err, {
      context: "call-queue.processNext",
      extra: { callId },
    });

    try {
      await db.call.update({
        where: { id: callId },
        data: {
          status: CallStatus.ERROR,
          meta: {
            error: String(err?.message || err),
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

    // Если в очереди ещё есть задачи  продолжаем
    if (queue.length > 0) {
      void processNext();
    }
  }
}
