// src/lib/workers/task-queue.ts
import { db } from "@/lib/db";
import { CallTaskStatus } from "@prisma/client";

/**
 * Идемпотентно ставит задачу обработки звонка.
 *
 * Правила:
 * - Если задачи нет -> создаём NEW, nextRunAt=now
 * - Если задача DONE -> НЕ трогаем (чтобы не перезапускать обработку)
 * - Если задача PROCESSING -> НЕ трогаем (чтобы не сбить текущую обработку)
 * - Если задача NEW/ERROR/FAILED -> возвращаем в NEW и ставим nextRunAt=now
 */
export async function enqueueCallTask(callId: string) {
  const now = new Date();

  // Важно: чтобы не перезаписывать DONE/PROCESSING,
  // сначала читаем текущий статус (дешёвый select)
  const existing = await db.callTask.findUnique({
    where: { callId },
    select: { status: true },
  });

  // Если уже обработано — не ставим заново
  if (existing?.status === CallTaskStatus.DONE) return;

  // Если уже в процессе — не сбиваем lock
  if (existing?.status === CallTaskStatus.PROCESSING) return;

  // Если нет — создаём
  if (!existing) {
    await db.callTask.create({
      data: {
        callId,
        status: CallTaskStatus.NEW,
        attempts: 0,
        lockedAt: null,
        nextRunAt: now,
        lastAttemptAt: null,
        error: null,
      },
    });
    return;
  }

  // Иначе — реанимируем (NEW/ERROR/FAILED и т.п.)
  await db.callTask.update({
    where: { callId },
    data: {
      status: CallTaskStatus.NEW,
      lockedAt: null,
      nextRunAt: now,
      error: null,
      // attempts НЕ сбрасываем
    },
  });
}
