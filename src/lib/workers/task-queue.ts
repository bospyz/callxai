import { db } from "@/lib/db";
import { CallTaskStatus } from "@prisma/client";

/**
 * DB-backed queue: create-or-reset task for call processing.
 * NOTE: Prefer schema-level uniqueness on CallTask.callId for true idempotency.
 */
export async function enqueueCallTask(callId: string): Promise<void> {
  // If callId is unique in schema, this is safe upsert.
  // If not yet unique, we emulate idempotency by first trying update, then create.
  const updated = await db.callTask.updateMany({
    where: { callId },
    data: { status: CallTaskStatus.NEW, error: null },
  });

  if (updated.count === 0) {
    await db.callTask.create({
      data: { callId, status: CallTaskStatus.NEW, error: null, attempts: 0 },
    });
  }
}
