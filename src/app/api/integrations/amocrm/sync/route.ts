import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithCompany } from "@/lib/auth-guard";
import { syncAmoRecentCalls } from "@/lib/amocrm";
import { getQuotaForImport, getCallsQuota } from "@/lib/call-quota";

type SyncBody = {
  limit?: number;
  days?: number;
  skipShort?: boolean;
  minDurationSec?: number;
};

function buildLimitReachedMessage(plan: string, limit: number | null) {
  if (limit == null) {
    return "Тариф ENTERPRISE — звонков безлимит, но импорт сейчас недоступен.";
  }
  if (plan === "free") {
    return `Лимит в ${limit} бесплатных звонков исчерпан. Подключи тариф START, чтобы продолжить анализ звонков.`;
  }
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

    // ----------------------
    // body normalize
    // ----------------------
    let requestedLimit = Number(body.limit) || 50;
    if (requestedLimit < 1) requestedLimit = 1;
    // START должен уметь 2000 за прогон
    if (requestedLimit > 2000) requestedLimit = 2000;

    let days = Number(body.days) || 7;
    if (days < 1) days = 1;
    if (days > 90) days = 90;

    const skipShort = body.skipShort === true;

    // ----------------------
    // квота
    // ----------------------
    const { allowed: effectiveLimit, quota } = await getQuotaForImport(
      companyId,
      requestedLimit
    );

    const billableMin = quota.billableMinDurationSec ?? 30;

    // minDurationSec не должен быть ниже billableMin (иначе ты будешь "пропускать" меньше, чем квота считает)
    let minDurationSec = Number(body.minDurationSec) || billableMin;
    if (minDurationSec < billableMin) minDurationSec = billableMin;
    if (minDurationSec > 3600) minDurationSec = 3600;

    const limitReached =
      quota.limit !== null && (effectiveLimit <= 0 || (quota.remaining ?? 0) <= 0);

    if (limitReached) {
      return NextResponse.json(
        {
          ok: false,
          code: "LIMIT_REACHED",
          error: buildLimitReachedMessage(quota.plan, quota.limit),
          plan: quota.plan,
          quota,
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
          skippedShort: 0,
          plan: quota.plan,
          quota,
          message:
            "Доступных звонков по квоте не осталось. Обнови тариф, чтобы продолжить синхронизацию.",
        },
        { status: 200 }
      );
    }

    // ----------------------
    // импорт из amo
    // ВАЖНО: мы НЕ удаляем короткие из базы.
    // Лучше: фильтровать их ДО сохранения (см. пункт 2.2 ниже).
    // ----------------------
    const startedAt = new Date();

    const amoResult = await syncAmoRecentCalls({
      companyId,
      limit: effectiveLimit,
      days,
      skipShort,
      minDurationSec,
      billableMinDurationSec: billableMin,
    } as any);

    const createdCount =
      typeof amoResult?.created === "number" ? amoResult.created : 0;

const amoAny = amoResult as any;
const skippedShort =
  typeof amoAny?.skippedShort === "number" ? amoAny.skippedShort : 0;

    // ----------------------
    // вернём обновлённую квоту после импорта
    // ----------------------
    const quotaAfter = await getCallsQuota(companyId);

    return NextResponse.json(
      {
        ok: true,
        requestedLimit,
        limit: effectiveLimit,
        days,
        skipShort,
        minDurationSec: skipShort ? minDurationSec : null,
        created: createdCount,
        skippedShort,
        plan: quotaAfter.plan,
        quota: quotaAfter,
        freeLimit: quotaAfter.limit,
        freeRemaining: quotaAfter.remaining,
        message: `Импорт выполнен: создано ${createdCount} новых звонков из AmoCRM. Пропущено коротких: ${skippedShort}.`,
        debug: { startedAt: startedAt.toISOString() },
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
