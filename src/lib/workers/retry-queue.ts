// src/lib/workers/retry-queue.ts

import { CallStatus } from "@prisma/client";
import { db } from "../db";
import { enqueueCallProcessing } from "./queue";

/**
 * Ретраим один конкретный звонок.
 * Если передан companyId  дополнительно проверяем принадлежность компании.
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

  await enqueueCallProcessing({ callId: call.id });

  return {
    retried: 1,
  };
}

/**
 * Ретраим ERROR-звонки для одной компании.
 * max позволяет ограничить количество ретраев (например 50 в cron-скрипте).
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

    await enqueueCallProcessing({ callId: c.id });
  }

  return {
    retried: failedCalls.length,
  };
}

/**
 * Ретраим ВСЕ ERROR-звонки (по всем компаниям).
 * max  глобальный лимит (опционально).
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

    await enqueueCallProcessing({ callId: c.id });
  }

  return {
    retried: failedCalls.length,
  };
}
