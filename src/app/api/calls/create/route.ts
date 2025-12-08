import { NextRequest, NextResponse } from "next/server";
import { CallStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
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
      // reason: "within-limit" | "limit-reached" | "unlimited"
      const isLimitReached = quota.reason === "limit-reached";

      return NextResponse.json(
        {
          ok: false,
          error: isLimitReached
            ? `Лимит в ${quota.limit ?? 0} звонков исчерпан. Подключи или увеличь тариф, чтобы продолжить анализ звонков.`
            : "Сейчас нельзя принять новый звонок — квота по звонкам недоступна.",
          code: "CALL_QUOTA_EXCEEDED",
          limit: quota.limit ?? null,
          remaining: quota.remaining ?? null,
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

  await db.callTask.create({
  data: {
    callId: call.id,
    status: "NEW", // строкой, как в базе
  },
});


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
