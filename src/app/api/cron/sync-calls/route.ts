// src/app/api/cron/sync-calls/route.ts

import { NextRequest, NextResponse } from "next/server";
import { syncAmoRecentCalls } from "@/lib/amocrm";
import { canCompanyIngestCall } from "@/lib/call-quota";

async function handleSync(req: NextRequest) {
  const url = req.nextUrl;
  const secret = url.searchParams.get("secret");
  const companyId = url.searchParams.get("companyId");
  const limitParam = url.searchParams.get("limit");

  if (!secret || secret !== process.env.CRON_SECRET) {
    return new NextResponse("Forbidden: invalid cron secret", { status: 403 });
  }

  if (!companyId) {
    return new NextResponse("Missing companyId", { status: 400 });
  }

  // ✅ Единая квота: 30 бесплатных звонков без подписки
  const quota = await canCompanyIngestCall(companyId);

  if (!quota.allowed) {
    console.log(
      `[CRON] sync-calls: company ${companyId} exceeded free limit (${quota.limit}).`
    );

    return NextResponse.json({
      ok: false,
      companyId,
      created: 0,
      code: "FREE_LIMIT_REACHED",
      limit: quota.limit,
      message:
        "Лимит 30 бесплатных звонков исчерпан. Не синхронизируем новые звонки без подписки.",
    });
  }

  // Базовый лимит по URL-параметру
  let limit = 50;
  if (limitParam) {
    const n = Number(limitParam);
    if (!Number.isNaN(n) && n > 0) {
      limit = Math.min(n, 200);
    }
  }

  // Фактический лимит с учётом оставшихся бесплатных звонков
  let effectiveLimit = limit;

  if (
    quota.reason === "within-free-limit" &&
    typeof quota.remaining === "number"
  ) {
    if (quota.remaining <= 0) {
      console.log(
        `[CRON] sync-calls: company ${companyId} has 0 remaining free calls.`
      );
      return NextResponse.json({
        ok: true,
        companyId,
        created: 0,
        code: "FREE_LIMIT_REACHED",
        limit: quota.limit,
        freeRemaining: 0,
        message:
          "Доступных бесплатных звонков не осталось. Для продолжения нужна подписка.",
      });
    }

    if (effectiveLimit > quota.remaining) {
      effectiveLimit = quota.remaining;
    }
  }

  if (effectiveLimit <= 0) {
    return NextResponse.json({
      ok: true,
      companyId,
      created: 0,
      code: "NOTHING_TO_SYNC",
      limit: quota.limit,
      freeRemaining: quota.remaining ?? null,
      message: "Нет доступных звонков для синхронизации.",
    });
  }

  try {
    const result = await syncAmoRecentCalls({
      companyId,
      limit: effectiveLimit,
    });

    return NextResponse.json({
      ok: result.ok,
      companyId,
      created: result.created,
      code: "SYNC_OK",
      limit: effectiveLimit,
      freeLimit: quota.limit,
      freeRemaining: quota.remaining ?? null,
      message: result.message,
    });
  } catch (error: any) {
    console.error("[CRON] /api/cron/sync-calls error", error);

    return new NextResponse(
      error?.message
        ? `Failed to sync amoCRM calls: ${error.message}`
        : "Failed to sync amoCRM calls",
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleSync(req);
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}
