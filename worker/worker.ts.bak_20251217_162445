import { db } from "./prisma";
import { CallStatus, CallTaskStatus } from "@prisma/client";
import { processCall } from "../src/lib/call-analysis";

const CONCURRENCY = Math.max(
  1,
  Math.min(50, Number(process.env.CALLX_WORKER_CONCURRENCY || 20))
);

const POLL_MS = Math.max(200, Number(process.env.CALLX_WORKER_POLL_MS || 500));
const MAX_ATTEMPTS = Math.max(
  1,
  Math.min(10, Number(process.env.CALLX_WORKER_MAX_ATTEMPTS || 5))
);

// простая экспонента: 10s, 30s, 90s, 5m, 15m...
function backoffMs(attempt: number) {
  const table = [10_000, 30_000, 90_000, 300_000, 900_000, 1_800_000];
  return table[Math.min(table.length - 1, Math.max(0, attempt - 1))];
}

function errToString(err: unknown) {
  if (!err) return "Unknown error";
  if (err instanceof Error) return err.message || String(err);
  return String(err);
}

/**
 * Взять ОДНУ задачу атомарно:
 * - статус NEW
 * - nextRunAt null или <= now
 * - lock ставим через updateMany с фильтром
 */
async function takeOneTask() {
  const now = new Date();

  const candidate = await db.callTask.findFirst({
    where: {
      status: CallTaskStatus.NEW,
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
    },
    orderBy: [{ createdAt: "asc" }],
    select: { id: true, callId: true, attempts: true },
  });

  if (!candidate) return null;

  // пытаемся залочить именно эту задачу (если уже забрали — updateMany вернёт 0)
  const locked = await db.callTask.updateMany({
    where: {
      id: candidate.id,
      status: CallTaskStatus.NEW,
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
      lockedAt: null,
    },
    data: {
      status: CallTaskStatus.PROCESSING,
      lockedAt: now,
      lastAttemptAt: now,
      attempts: { increment: 1 },
      error: null,
    },
  });

  if (locked.count !== 1) return null;

  return candidate;
}

async function handleTask(taskId: string, callId: string) {
  try {
    // помечаем сам звонок как PROCESSING (чтобы UI видел, что он реально в работе)
    await db.call.update({
      where: { id: callId },
      data: { status: CallStatus.PROCESSING },
    });

    // основной пайплайн анализа одного звонка
    await processCall(callId);

    // успех: DONE на задаче и на звонке
    await db.$transaction([
      db.callTask.update({
        where: { id: taskId },
        data: {
          status: CallTaskStatus.DONE,
          lockedAt: null,
          nextRunAt: null,
          error: null,
        },
      }),
      db.call.update({
        where: { id: callId },
        data: { status: CallStatus.DONE },
      }),
    ]);
  } catch (err) {
    const msg = errToString(err);

    // читаем attempts, чтобы решить: retry или окончательный ERROR
    const fresh = await db.callTask.findUnique({
      where: { id: taskId },
      select: { attempts: true },
    });

    const attempts = fresh?.attempts ?? 1;

    if (attempts < MAX_ATTEMPTS) {
      const next = new Date(Date.now() + backoffMs(attempts));

      await db.$transaction([
        db.callTask.update({
          where: { id: taskId },
          data: {
            status: CallTaskStatus.NEW, // возвращаем в очередь
            lockedAt: null,
            nextRunAt: next,
            error: msg,
          },
        }),
        db.call.update({
          where: { id: callId },
          data: {
            status: CallStatus.ERROR, // можно оставить ERROR, но UI будет видеть фейл
            meta: {
              // аккуратно: meta может быть null
              workerError: msg,
              workerNextRunAt: next.toISOString(),
              workerAttempts: attempts,
            },
          },
        }),
      ]);

      console.error(
        `[worker] call=${callId} attempt=${attempts}/${MAX_ATTEMPTS} failed, retry at ${next.toISOString()}: ${msg}`
      );
      return;
    }

    // окончательный ERROR
    await db.$transaction([
      db.callTask.update({
        where: { id: taskId },
        data: {
          status: CallTaskStatus.ERROR,
          lockedAt: null,
          nextRunAt: null,
          error: msg,
        },
      }),
      db.call.update({
        where: { id: callId },
        data: {
          status: CallStatus.ERROR,
          meta: {
            workerError: msg,
            workerAttempts: attempts,
            workerFinal: true,
          },
        },
      }),
    ]);

    console.error(`[worker] call=${callId} FINAL ERROR: ${msg}`);
  }
}

async function workerLoop() {
  console.log("[CALLX worker] started. concurrency =", CONCURRENCY);

  while (true) {
    // запускаем до CONCURRENCY параллельных “взять+обработать”
    const slots = Array.from({ length: CONCURRENCY }).map(async () => {
      const t = await takeOneTask();
      if (!t) return;
      await handleTask(t.id, t.callId);
    });

    await Promise.all(slots);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

workerLoop().catch((e) => {
  console.error("[CALLX worker] fatal error:", e);
  process.exit(1);
});
