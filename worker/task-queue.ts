// src/lib/workers/task-queue.ts
import { db } from "@/lib/db";
import { CallTaskStatus } from "@prisma/client";

export async function enqueueCallTask(callId: string) {
  const now = new Date();

  await db.callTask.upsert({
    where: { callId },
    create: {
      callId,
      status: CallTaskStatus.NEW,
      attempts: 0,
      lockedAt: null,
      nextRunAt: null,
      lastAttemptAt: null,
      error: null,
    },
    update: {
      // если задача уже была ERROR/PROCESSING — возвращаем в NEW
      status: CallTaskStatus.NEW,
      lockedAt: null,
      nextRunAt: null,
      error: null,
      // attempts не сбрасываем — это важно для диагностики
      updatedAt: now,
    },
  });
}
