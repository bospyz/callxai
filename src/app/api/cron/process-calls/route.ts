import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CallStatus } from "@prisma/client";
import { processCall } from "@/lib/call-analysis";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  const limitParam = searchParams.get("limit") ?? "10";
  const limit = Math.max(1, Math.min(50, Number(limitParam) || 10));

  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json(
      { ok: false, message: "Forbidden" },
      { status: 403 }
    );
  }

  // Берём только НОВЫЕ звонки
  const calls = await db.call.findMany({
    where: { status: CallStatus.NEW },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let processed = 0;
  const errors: { callId: string; message: string }[] = [];

  for (const call of calls) {
    try {
      await processCall(call.id);
      processed++;
    } catch (err: any) {
      errors.push({
        callId: call.id,
        message: String(err?.message || err),
      });

      await db.call.update({
        where: { id: call.id },
        data: { status: CallStatus.ERROR },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    total: calls.length,
    processed,
    skipped: calls.length - processed,
    errors,
  });
}
