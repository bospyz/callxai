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

  // ✅ Общая квота (FREE / START / PRO / ENTERPRISE)
  const quota = await canCompanyIngestCall(companyId);
  // quota: { allowed: boolean; reason: "within-limit" | "limit-reached" | "unlimited"; limit: number | null; remaining: number | null; callsCount: number; }

  if (!quota.allowed) {
    const isLimitReached = quota.reason === "limit-reached";

    console.log(
      `[CRON] sync-calls: company ${companyId} quota blocked. reason=${quota.reason}, limit=${quota.limit}, remaining=${quota.remaining}`
    );

    return NextResponse.json(
      {
        ok: false,
        companyId,
        created: 0,
        code: "CALL_QUOTA_EXCEEDED",
        limit: quota.limit,
        remaining: quota.remaining,
        message: isLimitReached
          ? `Лимит в ${quota.limit ?? 0} звонков исчерпан. Обнови или подключи тариф, чтобы продолжить синхронизацию.`
          : "Сейчас синхронизация звонков недоступна по квоте.",
      },
      { status: 402 }
    );
  }

  // Базовый лимит по URL-параметру
  let limit = 50;
  if (limitParam) {
    const n = Number(limitParam);
    if (!Number.isNaN(n) && n > 0) {
      limit = Math.min(n, 200);
    }
  }

  // Фактический лимит с учётом оставшихся звонков по тарифу
  let effectiveLimit = limit;

  if (quota.reason === "within-limit" && typeof quota.remaining === "number") {
    if (quota.remaining <= 0) {
      console.log(
        `[CRON] sync-calls: company ${companyId} has 0 remaining calls in plan.`
      );
      return NextResponse.json(
        {
          ok: false,
          companyId,
          created: 0,
          code: "CALL_QUOTA_EXCEEDED",
          limit: quota.limit,
          remaining: quota.remaining,
          message: `Достигнут лимит в ${quota.limit ?? 0} звонков по текущему тарифу. Обнови тариф в разделе биллинга, чтобы продолжить синхронизацию.`,
        },
        { status: 402 }
      );
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
      remaining: quota.remaining ?? null,
      message: "Нет доступных звонков для синхронизации по текущей квоте.",
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
      usedLimit: effectiveLimit,
      planLimit: quota.limit,
      remainingAfter: quota.remaining, // это «до» вызова, но для фронта всё равно ок как референс
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
