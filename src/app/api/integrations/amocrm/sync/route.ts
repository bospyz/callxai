// src/app/api/integrations/amocrm/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithCompany } from "@/lib/auth-guard";
import { syncAmoRecentCalls } from "@/lib/amocrm-sync";
import { getCallsQuota, getQuotaForImport, getBillableMinDurationSec } from "@/lib/call-quota";

type SyncBody = {
  limit?: number;
  days?: number;
  skipShort?: boolean;
  minDurationSec?: number;
};

function clampInt(v: any, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function buildLimitReachedMessage(plan: string, limit: number | null) {
  const p = String(plan || "free").toLowerCase();
  if (limit == null) return "Тариф ENTERPRISE — звонков безлимит, но импорт сейчас недоступен.";
  if (p === "free") return `Лимит в ${limit} бесплатных звонков исчерпан. Подключи тариф START, чтобы продолжить анализ звонков.`;
  return `Лимит в ${limit} звонков по текущему тарифу исчерпан. Обнови тариф или свяжись с поддержкой, чтобы увеличить лимит.`;
}

export async function POST(req: NextRequest) {
  try {
    const { companyId } = await requireAuthWithCompany();

    let body: SyncBody = {};
    try {
      body = (await req.json()) as SyncBody;
    } catch {
      body = {};
    }

    const quota = await getCallsQuota(companyId);
    const planKey = quota.plan; // "free" | "start" | "pro" | "enterprise"
    const billableMin = getBillableMinDurationSec(planKey); // обычно 30

    // правила
    let requestedLimit = clampInt(body.limit, 1, 5000, 50);
    let days = clampInt(body.days, 1, 90, 7);
    let skipShort = body.skipShort === true;
    let minDurationSec = clampInt(body.minDurationSec, 5, 3600, billableMin);

    // FREE: сервер источник правды
    if (planKey === "free") {
      requestedLimit = 30;
      days = 7;
      skipShort = true;
      minDurationSec = billableMin;
    } else {
      if (skipShort) minDurationSec = Math.max(minDurationSec, billableMin);
    }

    // квота: сколько реально можно создать сейчас
    const { allowed: effectiveLimit, quota: quotaForRun } = await getQuotaForImport(
      companyId,
      requestedLimit
    );

    const limitReached =
      quotaForRun.limit !== null &&
      (effectiveLimit <= 0 || (quotaForRun.remaining ?? 0) <= 0);

    if (limitReached) {
      return NextResponse.json(
        {
          ok: false,
          code: "LIMIT_REACHED",
          error: buildLimitReachedMessage(quotaForRun.plan, quotaForRun.limit),
          plan: quotaForRun.plan,
          quota: quotaForRun,
        },
        { status: 402 }
      );
    }

    if (effectiveLimit <= 0) {
      return NextResponse.json(
        {
          ok: true,
          requestedLimit,
          limit: 0,
          days,
          skipShort,
          minDurationSec: skipShort ? minDurationSec : null,
          created: 0,
          plan: quotaForRun.plan,
          quota: quotaForRun,
          message: "Доступных звонков по квоте не осталось. Обнови тариф, чтобы продолжить синхронизацию.",
        },
        { status: 200 }
      );
    }

    // safety cap (опционально)
    const safeEffectiveLimit = planKey !== "free" ? Math.min(effectiveLimit, 2000) : effectiveLimit;

    const amo = await syncAmoRecentCalls({
      companyId,
      limit: safeEffectiveLimit,
      days,
      skipShort,
      minDurationSec,
      // perPage/scanMax можно оставить по умолчанию
    });

    const updatedQuota = await getCallsQuota(companyId);

    return NextResponse.json(
      {
        ok: true,
        requestedLimit,
        limit: safeEffectiveLimit,
        days,
        skipShort,
        minDurationSec: skipShort ? minDurationSec : null,

        created: amo.created,

        // диагностика — это важно для твоего кейса "хочу 41, получаю 29"
        debug: {
          scanned: amo.scanned,
          skippedShort: amo.skippedShort,
          skippedExists: amo.skippedExists,
          durationMissing: amo.durationMissing,
          durationLt: amo.durationLt,
          durationGte: amo.durationGte,
          stoppedBy: amo.stoppedBy,
          lastPage: amo.lastPage,
          lastItemsCount: amo.lastItemsCount,
        },

        plan: updatedQuota.plan,
        quota: updatedQuota,
        message: `Импорт выполнен: создано ${amo.created} новых звонков из amoCRM. ${amo.message}`,
      },
      { status: 200 }
    );
  } catch (err: any) {
    const msg = String(err?.message || err);

    if (msg.includes("amoCRM access token expired")) {
      return NextResponse.json(
        {
          ok: false,
          code: "AMO_TOKEN_EXPIRED",
          error: "Токен AmoCRM истёк или невалиден. Переподключи интеграцию AmoCRM.",
        },
        { status: 401 }
      );
    }

    if (msg.startsWith("Unauthorized")) return new NextResponse("Unauthorized", { status: 401 });
    if (msg.includes("No companyId in session")) return new NextResponse("No companyId in session", { status: 400 });

    console.error("[API] /api/integrations/amocrm/sync error", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
