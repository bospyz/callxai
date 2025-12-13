// src/app/api/calls/create/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CallStatus } from "@prisma/client";
import { enqueueCallTask } from "@/lib/workers/task-queue";

export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const companyId = (session.user as any).companyId;
  if (!companyId) {
    return new NextResponse("No companyId in session", { status: 400 });
  }

  try {
    const body = await req.json();
    const { audioUrl, audioUrlExternal, duration, meta } = body;

    if (!audioUrl && !audioUrlExternal) {
      return new NextResponse(
        "audioUrl or audioUrlExternal is required",
        { status: 400 }
      );
    }

    // 1. Создаём запись звонка
    const call = await db.call.create({
      data: {
        companyId,
        status: CallStatus.NEW,
        audioUrl: audioUrl ?? null,
        audioUrlExternal: audioUrlExternal ?? null,
        duration: duration ?? null,
        occurredAt: new Date(),
        meta: meta ?? {},
      },
    });

    // 2. Отправляем в очередь HYPERFLOW (download → split → ASR → analyze)
    await enqueueCallTask(call.id);

    return NextResponse.json({
      ok: true,
      callId: call.id,
      status: CallStatus.NEW,
      message: "Call created and pushed to processing queue",
    });
  } catch (err: any) {
    console.error("[API] /api/calls/create error", err);
    return new NextResponse(
      err?.message ?? "Internal Server Error",
      { status: 500 }
    );
  }
}
