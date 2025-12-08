import { db } from "./prisma";
import { CallStatus, CallTaskStatus } from "@prisma/client";
import { processCall } from "../src/lib/call-analysis";

const CONCURRENCY = Number(process.env.CALLX_WORKER_CONCURRENCY || 20);

async function takeBatch(limit: number) {
  const tasks = await db.callTask.findMany({
    where: { status: CallTaskStatus.NEW },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { call: true },
  });

  if (tasks.length === 0) return [];

  await db.callTask.updateMany({
    where: {
      id: { in: tasks.map((t: any) => t.id) },
      status: CallTaskStatus.NEW,
    },
    data: {
      status: CallTaskStatus.PROCESSING,
      attempts: { increment: 1 },
    },
  });

  return tasks;
}

async function processBatch() {
  const tasks = await takeBatch(CONCURRENCY);
  if (tasks.length === 0) {
    return;
  }

  await Promise.all(
    tasks.map(async (task: any) => {
      try {
        // основной пайплайн анализа одного звонка
        await processCall(task.callId);

        await db.callTask.update({
          where: { id: task.id },
          data: { status: CallTaskStatus.DONE },
        });
      } catch (err: any) {
        console.error("[worker] error for call", task.callId, err);

        // помечаем сам звонок как ошибочный
        await db.call.update({
          where: { id: task.callId },
          data: {
            status: CallStatus.ERROR,
            meta: {
              ...(task.call?.meta as any),
              workerError: String(err?.message || err),
            },
          },
        });

        // логируем ошибку на уровне задачи
        await db.callTask.update({
          where: { id: task.id },
          data: {
            status: CallTaskStatus.ERROR,
            error: String(err?.message || err),
          },
        });
      }
    })
  );
}

async function mainLoop() {
  console.log("[CALLX worker] started with concurrency =", CONCURRENCY);

  while (true) {
    await processBatch();
    await new Promise((r) => setTimeout(r, 500));
  }
}

mainLoop().catch((e) => {
  console.error("[CALLX worker] fatal error:", e);
  process.exit(1);
});
