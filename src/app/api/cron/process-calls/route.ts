// src/app/api/cron/process-calls/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CallStatus } from "@prisma/client";
import { enqueueCallProcessing } from "@/lib/workers/queue";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");

  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json(
      { ok: false, message: "Forbidden" },
      { status: 403 }
    );
  }

  const limitParam = searchParams.get("limit") ?? "20";
  const limit = Math.max(1, Math.min(200, Number(limitParam) || 20));

  // Берём звонки в статусе NEW
  const calls = await db.call.findMany({
    where: { status: CallStatus.NEW },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  let queued = 0;

  for (const c of calls) {
    // Для надёжности перед отправкой в очередь → ставим статус NEW
    await db.call.update({
      where: { id: c.id },
      data: { status: CallStatus.NEW },
    });

    await enqueueCallProcessing({ callId: c.id });
    queued++;
  }

  return NextResponse.json({
    ok: true,
    queued,
    message: `Queued ${queued} calls for AI processing`,
  });
}
