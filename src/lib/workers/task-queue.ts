import { db } from "@/lib/db";
import { CallTaskStatus } from "@prisma/client";

/**
 * DB-backed queue: strict idempotency via unique CallTask.callId
 */
export async function enqueueCallTask(callId: string): Promise<void> {
  await db.callTask.upsert({
    where: { callId },
    create: {
      callId,
      status: CallTaskStatus.NEW,
      error: null,
      attempts: 0,
      lockedAt: null,
      nextRunAt: null,
      lastAttemptAt: null,
    },
    update: {
      status: CallTaskStatus.NEW,
      error: null,
      lockedAt: null,
      nextRunAt: null,
    },
  });
}
