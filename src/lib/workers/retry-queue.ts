// src/lib/workers/retry-queue.ts

import { CallStatus, CallTaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { enqueueCallTask } from "@/lib/workers/task-queue";

/**
 * Ретраим один конкретный звонок.
 * Если передан companyId — дополнительно проверяем принадлежность компании.
 */
export async function retrySingleCall(callId: string, companyId?: string) {
  const call = await db.call.findFirst({
    where: {
      id: callId,
      ...(companyId ? { companyId } : {}),
    },
  });

  if (!call) {
    throw new Error("Call not found or does not belong to company");
  }

  await db.call.update({
    where: { id: call.id },
    data: {
      status: CallStatus.NEW,
    },
  });

    await db.callTask.updateMany({
    where: { callId: call.id },
    data: { status: "NEW" as any, error: null, lockedAt: null, nextRunAt: null },
  });

    await db.callTask.updateMany({
    where: { callId: call.id },
    data: {
      status: CallTaskStatus.NEW,
      error: null,
      lockedAt: null,
      nextRunAt: null,
    },
  });

  await enqueueCallTask(call.id);

  return {
    retried: 1,
  };
}

/**
 * Ретраим ERROR-звонки для одной компании.
 * max позволяет ограничить количество ретраев (например, 50 в cron-скрипте).
 */
export async function retryFailedCallsForCompany(
  companyId: string,
  max?: number
) {
  const failedCalls = await db.call.findMany({
    where: {
      companyId,
      status: CallStatus.ERROR,
    },
    orderBy: {
      createdAt: "asc",
    },
    take: max ?? undefined,
  });

  for (const c of failedCalls) {
    await db.call.update({
      where: { id: c.id },
      data: {
        status: CallStatus.NEW,
      },
    });

        await db.callTask.updateMany({
      where: { callId: c.id },
      data: { status: "NEW" as any, error: null, lockedAt: null, nextRunAt: null },
    });

        await db.callTask.updateMany({
      where: { callId: c.id },
      data: {
        status: CallTaskStatus.NEW,
        error: null,
        lockedAt: null,
        nextRunAt: null,
      },
    });

    await enqueueCallTask(c.id);
  }

  return {
    retried: failedCalls.length,
  };
}

/**
 * Ретраим ERROR-звонки по всем компаниям.
 * max — глобальный лимит (опционально).
 */
export async function retryFailedCalls(max?: number) {
  const failedCalls = await db.call.findMany({
    where: {
      status: CallStatus.ERROR,
    },
    orderBy: {
      createdAt: "asc",
    },
    take: max ?? undefined,
  });

  for (const c of failedCalls) {
    await db.call.update({
      where: { id: c.id },
      data: {
        status: CallStatus.NEW,
      },
    });

        await db.callTask.updateMany({
      where: { callId: c.id },
      data: { status: "NEW" as any, error: null, lockedAt: null, nextRunAt: null },
    });

        await db.callTask.updateMany({
      where: { callId: c.id },
      data: {
        status: CallTaskStatus.NEW,
        error: null,
        lockedAt: null,
        nextRunAt: null,
      },
    });

    await enqueueCallTask(c.id);
  }

  return {
    retried: failedCalls.length,
  };
}

/**
 * Ретраим все звонки в статусе ERROR по всем компаниям (без лимита).
 * Удобно вызывать вручную из админки/скрипта.
 */
export async function retryAllFailedCalls() {
  const failed = await db.call.findMany({
    where: {
      status: CallStatus.ERROR,
    },
    select: { id: true },
  });

  for (const c of failed) {
    await db.call.update({
      where: { id: c.id },
      data: {
        status: CallStatus.NEW,
      },
    });

        await db.callTask.updateMany({
      where: { callId: c.id },
      data: { status: "NEW" as any, error: null, lockedAt: null, nextRunAt: null },
    });

        await db.callTask.updateMany({
      where: { callId: c.id },
      data: {
        status: CallTaskStatus.NEW,
        error: null,
        lockedAt: null,
        nextRunAt: null,
      },
    });

    await enqueueCallTask(c.id);
  }

  return { retried: failed.length };
}


