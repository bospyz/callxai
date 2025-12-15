// src/app/api/cron/sync-calls/route.ts

import { NextRequest, NextResponse } from "next/server";
import { syncAmoRecentCalls } from "@/lib/amocrm-sync";
import { canCompanyIngestCall, getCallsQuota } from "@/lib/call-quota";

async function handleSync(req: NextRequest) {
  const url = req.nextUrl;
  const secret = url.searchParams.get("secret");
  const companyId = url.searchParams.get("companyId");
  const limitParam = url.searchParams.get("limit");
  const daysParam = url.searchParams.get("days");

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return new NextResponse("Forbidden: invalid cron secret", { status: 403 });
  }

  if (!companyId) {
    return new NextResponse("Missing companyId", { status: 400 });
  }

  // Квота (общая)
  const quotaGate = await canCompanyIngestCall(companyId);
  if (!quotaGate.allowed) {
    return NextResponse.json(
      {
        ok: false,
        companyId,
        created: 0,
        code: "CALL_QUOTA_EXCEEDED",
        limit: quotaGate.limit,
        remaining: quotaGate.remaining,
        message:
          quotaGate.reason === "limit-reached"
            ? `Лимит в ${quotaGate.limit ?? 0} звонков исчерпан.`
            : "Синхронизация недоступна по квоте.",
      },
      { status: 402 }
    );
  }

  // URL limit (1..200)
  let limit = 50;
  if (limitParam) {
    const n = Number(limitParam);
    if (!Number.isNaN(n) && n > 0) limit = Math.min(n, 200);
  }

  // days (1..90)
  let days = 7;
  if (daysParam) {
    const n = Number(daysParam);
    if (!Number.isNaN(n) && n > 0) days = Math.min(n, 90);
  }

  // effectiveLimit с учетом remaining
  let effectiveLimit = limit;
  if (quotaGate.reason === "within-limit" && typeof quotaGate.remaining === "number") {
    effectiveLimit = Math.min(effectiveLimit, quotaGate.remaining);
  }

  if (effectiveLimit <= 0) {
    return NextResponse.json({
      ok: true,
      companyId,
      created: 0,
      code: "NOTHING_TO_SYNC",
      limit: quotaGate.limit,
      remaining: quotaGate.remaining ?? null,
      message: "Нет доступных звонков для синхронизации по текущей квоте.",
    });
  }

  // Минимальная длительность для списания квоты — берем из quota
  const quota = await getCallsQuota(companyId);

  const result = await syncAmoRecentCalls({
    companyId,
    limit: effectiveLimit,
    days,
    skipShort: true,
    minDurationSec: quota.billableMinDurationSec,
  });

  return NextResponse.json({
    ok: result.ok,
    companyId,
    created: result.created,
    code: result.ok ? "SYNC_OK" : "SYNC_DISABLED",
    usedLimit: effectiveLimit,
    planLimit: quotaGate.limit,
    remainingRef: quotaGate.remaining,
    message: result.message,
  });
}

export async function GET(req: NextRequest) {
  return handleSync(req);
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}
