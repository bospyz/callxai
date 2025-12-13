// src/app/api/cron/process-calls/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CallStatus } from "@prisma/client";
import { enqueueCallTask } from "@/lib/workers/task-queue";
import { processCall } from "@/lib/call-analysis";
import {
  resetStuckTasks,
  listDueTasks,
  claimTask,
  markTaskDone,
  markTaskError,
  markCallProcessing,
} from "@/lib/workers/task-runner";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");

  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }

  const limitParam = searchParams.get("limit") ?? "20";
  const limit = Math.max(1, Math.min(200, Number(limitParam) || 20));

  // 1) Ensure NEW calls are enqueued (idempotent)
  const calls = await db.call.findMany({
    where: { status: CallStatus.NEW },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  let queued = 0;
  for (const c of calls) {
    await enqueueCallTask(c.id);
    queued++;
  }

  // 2) Reset stuck tasks
  const reset = await resetStuckTasks();

  // 3) Execute due tasks
  const due = await listDueTasks(limit);

  let claimed = 0;
  let processed = 0;
  let errors = 0;

  for (const t of due) {
    const ok = await claimTask(t.id);
    if (!ok) continue;

    claimed += 1;

    try {
      await markCallProcessing(t.callId);
      await processCall(t.callId);
      await markTaskDone(t.id);
      processed += 1;
    } catch (err: any) {
      const msg = err?.message ?? String(err ?? "Unknown error");
      // attempts уже increment в claimTask, поэтому передаем t.attempts+1
      await markTaskError(t.id, t.attempts + 1, msg);
      errors += 1;

      try {
        await db.call.update({
          where: { id: t.callId },
          data: { status: CallStatus.ERROR, meta: { error: msg } },
        });
      } catch (_) {
        // ignore
      }
    }
  }

  return NextResponse.json({
    ok: true,
    queued,
    reset,
    claimed,
    processed,
    errors,
    message: `Queued=${queued} Reset=${reset} Claimed=${claimed} Processed=${processed} Errors=${errors}`,
  });
}
