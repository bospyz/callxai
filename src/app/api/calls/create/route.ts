import { NextRequest, NextResponse } from "next/server";
import { CallStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { enqueueCallProcessing } from "@/lib/workers/queue";

/**
 * Создание звонка и постановка в асинхронную очередь обработки.
 *
 * Ожидаемый body:
 * {
 *   "audioUrl": "https://...mp3"
 * }
 * При необходимости сюда потом можно добавить externalId, managerId, meta и т.п.
 */
export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const companyId = (session.user as any).companyId as string | undefined;
  if (!companyId) {
    return new NextResponse("No companyId in session", { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const audioUrl = body?.audioUrl as string | undefined;
  if (!audioUrl) {
    return new NextResponse('Field "audioUrl" is required', { status: 400 });
  }

  try {
    const call = await db.call.create({
      data: {
        companyId,
        status: CallStatus.NEW,
        audioUrl,
      },
    });

    // Ставим в очередь асинхронную обработку (fire-and-forget)
    enqueueCallProcessing({ callId: call.id }).catch((err) => {
      console.error("[QUEUE] enqueueCallProcessing error", err);
    });

    return NextResponse.json({ ok: true, call });
  } catch (err: any) {
    console.error("[API] /api/calls/create error", err);
    return new NextResponse(
      err?.message ? `Failed to create call: ${err.message}` : "Failed to create call",
      { status: 500 }
    );
  }
}
