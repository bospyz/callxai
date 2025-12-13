import { db } from "@/lib/db";
import { CallStatus, CallTaskStatus } from "@prisma/client";

const STUCK_MINUTES = 15;
const MAX_ATTEMPTS = 8;

function backoffSeconds(attempt: number): number {
  if (attempt <= 1) return 30;
  if (attempt === 2) return 120;
  if (attempt === 3) return 300;
  if (attempt === 4) return 900;
  return 3600;
}

export async function resetStuckTasks(now = new Date()): Promise<number> {
  const stuckBefore = new Date(now.getTime() - STUCK_MINUTES * 60 * 1000);

  const res = await db.callTask.updateMany({
    where: {
      status: CallTaskStatus.PROCESSING,
      lockedAt: { lt: stuckBefore },
    },
    data: {
      status: CallTaskStatus.NEW,
      error: "stuck-reset: task was PROCESSING too long",
      lockedAt: null,
      nextRunAt: new Date(now.getTime() + 60 * 1000),
    },
  });

  return res.count;
}

export async function listDueTasks(limit: number, now = new Date()) {
  return db.callTask.findMany({
    where: {
      status: CallTaskStatus.NEW,
      lockedAt: null,
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
    },
    orderBy: [{ createdAt: "asc" }],
    take: limit,
    select: { id: true, callId: true, attempts: true },
  });
}

export async function claimTask(taskId: string, now = new Date()): Promise<boolean> {
  const res = await db.callTask.updateMany({
    where: {
      id: taskId,
      status: CallTaskStatus.NEW,
      lockedAt: null,
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
    },
    data: {
      status: CallTaskStatus.PROCESSING,
      lockedAt: now,
      lastAttemptAt: now,
      attempts: { increment: 1 },
    },
  });

  return res.count === 1;
}

export async function markTaskDone(taskId: string): Promise<void> {
  await db.callTask.update({
    where: { id: taskId },
    data: {
      status: CallTaskStatus.DONE,
      error: null,
      lockedAt: null,
      nextRunAt: null,
    },
  });
}

export async function markTaskError(taskId: string, attemptAfterIncrement: number, message: string, now = new Date()): Promise<void> {
  const normalized = (message || "Unknown error").slice(0, 2000);

  if (attemptAfterIncrement >= MAX_ATTEMPTS) {
    await db.callTask.update({
      where: { id: taskId },
      data: {
        status: CallTaskStatus.ERROR,
        error: normalized,
        lockedAt: null,
        nextRunAt: null,
      },
    });
    return;
  }

  const delaySec = backoffSeconds(attemptAfterIncrement);

  await db.callTask.update({
    where: { id: taskId },
    data: {
      status: CallTaskStatus.NEW,
      error: normalized,
      lockedAt: null,
      nextRunAt: new Date(now.getTime() + delaySec * 1000),
    },
  });
}

export async function markCallProcessing(callId: string): Promise<void> {
  await db.call.update({
    where: { id: callId },
    data: { status: CallStatus.PROCESSING },
  });
}
