import { NextRequest, NextResponse } from "next/server";
import { CallStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { enqueueCallProcessing } from "@/lib/workers/queue";
import { canCompanyIngestCall } from "@/lib/call-quota";

/**
 * Создание звонка и постановка в асинхронную очередь обработки.
 *
 * Ожидаемый body:
 * {
 *   "audioUrl": "https://...mp3",
 *   "externalId"?: "amo-call-id-123",
 *   "managerId"?: "manager-id",
 *   "meta"?: {...}
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const user = session?.user as any;

    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const companyId = user?.companyId as string | undefined;

    if (!companyId) {
      return new NextResponse("No companyId", { status: 400 });
    }

    // ✅ Проверка квоты перед созданием звонка
    const quota = await canCompanyIngestCall(companyId);

    if (!quota.allowed) {
      const isFree =
        quota.reason === "free-limit-exceeded" ||
        quota.reason === "within-free-limit" ||
        quota.reason === "no-subscription";

      const message = isFree
        ? `Ты выбрал все ${quota.limit} бесплатных звонков. Подключи тариф, чтобы продолжить анализировать отдел.`
        : `Лимит звонков по текущему тарифу (${quota.limit ?? "без лимита"}) исчерпан. Обнови тариф в разделе биллинга, чтобы продолжить.`;

      return NextResponse.json(
        {
          ok: false,
          error: message,
          code: "LIMIT_REACHED",
          limit: quota.limit,
          callsCount: quota.callsCount,
          remaining: quota.remaining,
          limitType: isFree ? "FREE" : "PAID",
        },
        { status: 402 }
      );
    }

    const body = (await req.json()) as {
      audioUrl?: string;
      externalId?: string | null;
      managerId?: string | null;
      meta?: any;
    };

    if (!body.audioUrl || typeof body.audioUrl !== "string") {
      return new NextResponse("Missing audioUrl", { status: 400 });
    }

    const call = await db.call.create({
      data: {
        companyId,
        audioUrl: body.audioUrl,
        externalId: body.externalId ?? null,
        managerId: body.managerId ?? null,
        meta: body.meta ?? null,
        status: CallStatus.NEW,
      },
    });

    // отправляем в воркер на обработку (транскрипция, скоринг и т.п.)
await enqueueCallProcessing({ callId: call.id });


    return NextResponse.json(
      {
        ok: true,
        call,
        limit: quota.limit,
        remaining: quota.remaining,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[API] /api/calls/create error", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
