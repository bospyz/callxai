// src/lib/workers/retry-queue.ts

import { CallStatus } from "@prisma/client";
import { db } from "../db";
import { enqueueCallProcessing } from "./queue";

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
    select: { id: true },
  });

  if (!call) {
    throw new Error("Call not found");
  }

  await db.call.update({
    where: { id: call.id },
    data: {
      status: CallStatus.NEW,
    },
  });

  await enqueueCallProcessing({ callId: call.id });
}

/**
 * Ретраим все ERROR-звонки компании (ограничение по количеству).
 */
export async function retryFailedCallsForCompany(
  companyId: string,
  limit: number = 50
) {
  const failedCalls = await db.call.findMany({
    where: {
      companyId,
      status: CallStatus.ERROR,
    },
    select: { id: true },
    take: limit,
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
