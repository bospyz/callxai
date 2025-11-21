// src/lib/workers/queue.ts

import { CallStatus } from "@prisma/client";
import { db } from "../db";
import { processCall } from "../call-analysis";
import { logError, logInfo } from "../logger/Sentry";

export type CallJob = {
  callId: string;
};

/**
 * Простая in-memory очередь обработки звонков.
 * Работает в одном инстансе node-процесса.
 * Для продакшена это можно заменить на BullMQ/Redis,
 * сохранив тот же интерфейс enqueueCallProcessing.
 */

const queue: CallJob[] = [];
let isProcessing = false;

export async function enqueueCallProcessing(job: CallJob) {
  queue.push(job);
  // Не ждём завершения, просто триггерим обработку
  void processNext();
}

async function processNext() {
  if (isProcessing) return;
  const job = queue.shift();
  if (!job) return;

  isProcessing = true;
  const { callId } = job;

  try {
    // Обновляем статус на PROCESSING
    await db.call.update({
      where: { id: callId },
      data: {
        status: CallStatus.PROCESSING,
      },
    });

    logInfo("Start processing call", {
      context: "call-queue",
      extra: { callId },
    });

    // Основная логика анализа звонка
    await processCall(callId);

    logInfo("Call processed successfully", {
      context: "call-queue",
      extra: { callId },
    });
  } catch (err) {
    logError(err, {
      context: "call-queue.processCall",
      extra: { callId },
    });

    // В случае ошибки помечаем звонок как ERROR
    try {
      await db.call.update({
        where: { id: callId },
        data: {
          status: CallStatus.ERROR,
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
