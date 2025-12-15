// src/lib/workers/queue.ts

import { enqueueCallTask } from "@/lib/workers/task-queue";

/**
 * Legacy type (kept for compatibility with older callers).
 * In production we enqueue by callId into DB-backed queue.
 */
export type CallJob = {
  callId: string;
};

/**
 * Adds a call to processing queue (DB-backed).
 * NOTE:
 * - In-memory queues are not reliable in serverless (Vercel) and will lose tasks.
 * - This wrapper exists so older code can keep calling enqueueCallProcessing.
 */
export async function enqueueCallProcessing(job: CallJob): Promise<void> {
  await enqueueCallTask(job.callId);
}
