// src/lib/workers/task-runner.ts
import { db } from "@/lib/db";
import { CallTaskStatus } from "@prisma/client";

export type ClaimedTask = {
  id: string;
  callId: string;
  status: CallTaskStatus;
  attempts: number;
  lockedAt: Date | null;
  nextRunAt: Date | null;
  lastAttemptAt: Date | null;
  error: string | null;
};

type ClaimParams = {
  limit: number;
  lockTimeoutMs?: number; // сколько считаем "зависшей"
};

type ResetParams = {
  timeoutMs: number;
  maxToReset?: number;
};

type MarkErrorParams = {
  taskId: string;
  error: unknown;
  maxAttempts?: number;      // после этого -> FAILED
  baseBackoffMs?: number;    // стартовый backoff
  maxBackoffMs?: number;     // потолок backoff
};

type MarkDoneParams = {
  taskId: string;
};

const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_BASE_BACKOFF_MS = 30_000; // 30s
const DEFAULT_MAX_BACKOFF_MS = 30 * 60_000; // 30m

function now() {
  return new Date();
}

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return typeof e === "string" ? e : JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/**
 * Exponential backoff with jitter.
 * attempts: 1 -> base, 2 -> 2x, 3 -> 4x ...
 */
function computeBackoffMs(attempts: number, baseMs: number, maxMs: number) {
  const exp = Math.min(20, Math.max(0, attempts - 1));
  const raw = Math.min(maxMs, baseMs * Math.pow(2, exp));
  const jitter = Math.floor(Math.random() * Math.min(5000, raw * 0.1));
  return Math.min(maxMs, raw + jitter);
}

/**
 * Атомарно "забирает" задачи:
 * - status=NEW
 * - nextRunAt is null OR nextRunAt <= now
 * - lock: переводим в PROCESSING, lockedAt=now, lastAttemptAt=now
 *
 * Важно: делаем через транзакцию.
 */
export async function claimTasks(params: ClaimParams): Promise<ClaimedTask[]> {
  const limit = Math.max(1, Math.min(50, Math.floor(params.limit)));
  const ts = now();

  return db.$transaction(async (tx) => {
    const candidates = await tx.callTask.findMany({
      where: {
        status: CallTaskStatus.NEW,
        OR: [{ nextRunAt: null }, { nextRunAt: { lte: ts } }],
      },
      orderBy: [{ nextRunAt: "asc" }, { updatedAt: "asc" }],
      take: limit,
      select: {
        id: true,
        callId: true,
        status: true,
        attempts: true,
        lockedAt: true,
        nextRunAt: true,
        lastAttemptAt: true,
        error: true,
      },
    });

    if (!candidates.length) return [];

    // Обновляем только те, которые всё ещё NEW (защита от гонки).
    // updateMany по id[] + status NEW -> PROCESSING
    const ids = candidates.map((t) => t.id);

    await tx.callTask.updateMany({
      where: {
        id: { in: ids },
        status: CallTaskStatus.NEW,
      },
      data: {
        status: CallTaskStatus.PROCESSING,
        lockedAt: ts,
        lastAttemptAt: ts,
        // nextRunAt НЕ трогаем здесь (runner уже решил, что она ready)
        // error НЕ трогаем — пусть останется для дебага, пока не будет успеха/новой ошибки
      },
    });

    // Перечитываем только реально залоченные (на случай, если часть забрал другой запуск)
    const locked = await tx.callTask.findMany({
      where: { id: { in: ids }, status: CallTaskStatus.PROCESSING, lockedAt: ts },
      select: {
        id: true,
        callId: true,
        status: true,
        attempts: true,
        lockedAt: true,
        nextRunAt: true,
        lastAttemptAt: true,
        error: true,
      },
    });

    return locked;
  });
}

/**
 * Сбрасывает "зависшие" PROCESSING задачи обратно в NEW.
 * Стратегия: если lockedAt < now - timeout => reset.
 */
export async function resetStuckTasks(params: ResetParams): Promise<{ reset: number }> {
  const timeoutMs = Math.max(10_000, params.timeoutMs);
  const maxToReset = Math.max(1, Math.min(5000, params.maxToReset ?? 1000));

  const cutoff = new Date(Date.now() - timeoutMs);

  // В Prisma нет limit на updateMany, поэтому делаем двухшагово:
  // 1) выбрать id
  // 2) updateMany по id[]
  const stuck = await db.callTask.findMany({
    where: {
      status: CallTaskStatus.PROCESSING,
      lockedAt: { lt: cutoff },
    },
    orderBy: { lockedAt: "asc" },
    take: maxToReset,
    select: { id: true },
  });

  if (!stuck.length) return { reset: 0 };

  const ids = stuck.map((x) => x.id);

  const res = await db.callTask.updateMany({
    where: { id: { in: ids }, status: CallTaskStatus.PROCESSING },
    data: {
      status: CallTaskStatus.NEW,
      lockedAt: null,
      nextRunAt: now(), // чтобы сразу можно было подхватить
      // error не чистим — пусть будет видно, что там было
    },
  });

  return { reset: res.count };
}

/**
 * Помечает задачу DONE + снимает lock.
 */
export async function markTaskDone(params: MarkDoneParams): Promise<void> {
  await db.callTask.update({
    where: { id: params.taskId },
    data: {
      status: CallTaskStatus.DONE,
      lockedAt: null,
      nextRunAt: null,
      error: null,
    },
  });
}

/**
 * Помечает ошибку, увеличивает attempts, ставит nextRunAt с backoff.
 * После maxAttempts -> FAILED (финал).
 */
export async function markTaskError(params: MarkErrorParams): Promise<{
  status: CallTaskStatus;
  attempts: number;
  nextRunAt: Date | null;
}> {
  const msg = toErrorMessage(params.error);
  const maxAttempts = Math.max(1, params.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const baseBackoffMs = Math.max(1000, params.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS);
  const maxBackoffMs = Math.max(baseBackoffMs, params.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS);

  const ts = now();

  return db.$transaction(async (tx) => {
    const task = await tx.callTask.findUnique({
      where: { id: params.taskId },
      select: { id: true, attempts: true, status: true },
    });

    if (!task) {
      // задача могла быть удалена/переехала — просто "no-op"
return { status: CallTaskStatus.ERROR, attempts: 0, nextRunAt: null };
    }

    const nextAttempts = (task.attempts ?? 0) + 1;

    if (nextAttempts >= maxAttempts) {
      const updated = await tx.callTask.update({
        where: { id: params.taskId },
        data: {
          status: CallTaskStatus.ERROR,
          attempts: nextAttempts,
          lockedAt: null,
          nextRunAt: null,
          lastAttemptAt: ts,
          error: msg,
        },
        select: { status: true, attempts: true, nextRunAt: true },
      });

      return updated;
    }

    const backoffMs = computeBackoffMs(nextAttempts, baseBackoffMs, maxBackoffMs);
    const nextRunAt = new Date(Date.now() + backoffMs);

    const updated = await tx.callTask.update({
      where: { id: params.taskId },
      data: {
        status: CallTaskStatus.NEW,
        attempts: nextAttempts,
        lockedAt: null,
        nextRunAt,
        lastAttemptAt: ts,
        error: msg,
      },
      select: { status: true, attempts: true, nextRunAt: true },
    });

    return updated;
  });
}
