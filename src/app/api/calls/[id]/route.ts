// src/app/api/calls/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const companyId = (session.user as any).companyId as string | undefined;
  if (!companyId) {
    return new NextResponse("No companyId in session", { status: 400 });
  }

  const { id } = await params;
  const callId = id;

  try {
    const call = await db.call.findFirst({
      where: {
        id: callId,
        companyId,
      },
      // include убрали, т.к. score — скалярное поле, а не relation
    });

    if (!call) {
      return new NextResponse("Not found", { status: 404 });
    }

    // нормализуем мету — иногда meta = Prisma.JsonValue
    const meta =
      typeof call.meta === "object" && call.meta !== null ? call.meta : {};

    const response = {
      ok: true,
      call: {
        id: call.id,
        companyId: call.companyId,
        externalId: call.externalId,
        status: call.status,
        createdAt: call.createdAt,
        occurredAt: call.occurredAt,

        // аудио
        audioUrl: call.audioUrl,
        audioUrlExternal: (call as any).audioUrlExternal ?? call.audioUrl,

        // текст разговора
        transcript: call.transcript,

        // первичный скоринг
        score: call.score,
        sentiment: call.sentiment,

        // метаданные и поля анализа
        meta,

        // «детальный анализ» — пока кладём то же самое, что и score,
        // либо потом заменишь на отдельный объект, если появится таблица CallScore
        detailed: call.score ?? null,
      },
    };

    return NextResponse.json(response);
  } catch (err: any) {
    console.error("[API] /api/calls/[id] error", err);
    return new NextResponse(
      err?.message
        ? `Failed to load call: ${err.message}`
        : "Failed to load call",
      { status: 500 }
    );
  }
}
