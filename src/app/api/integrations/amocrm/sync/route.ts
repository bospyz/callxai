import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithCompany } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { syncAmoRecentCalls } from "@/lib/amocrm";
import { getCallsQuota, getQuotaForImport } from "@/lib/call-quota";

type SyncBody = {
  limit?: number;
  days?: number;
  skipShort?: boolean;
  minDurationSec?: number;
};

type AmoSyncResult = {
  ok: boolean;
  created: number;
  message?: string;
  skippedShort?: number;
};

function clampInt(v: any, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function buildLimitReachedMessage(plan: string, limit: number | null) {
  const p = String(plan || "free").toLowerCase();
  if (limit == null) {
    return "Тариф ENTERPRISE — звонков безлимит, но импорт сейчас недоступен.";
  }
  if (p === "free") {
    return `Лимит в ${limit} бесплатных звонков исчерпан. Подключи тариф START, чтобы продолжить анализ звонков.`;
  }
  return `Лимит в ${limit} звонков по текущему тарифу исчерпан. Обнови тариф или свяжись с поддержкой, чтобы увеличить лимит.`;
}

export async function POST(req: NextRequest) {
  try {
    const { companyId } = await requireAuthWithCompany();

    // читаем body безопасно
    let body: SyncBody = {};
    try {
      body = (await req.json()) as SyncBody;
    } catch {
      body = {};
    }

    // получаем квоту
    const quota = await getCallsQuota(companyId);
    const planKey = quota.plan; // "free" | "start" | "pro" | "enterprise"

    // billable min (сейчас у тебя это 30 по логике call-quota)
    // если позже добавишь на тарифах другое — просто подтяни сюда.
    const billableMin = 30;

    // ---------- ПРАВИЛА ИМПОРТА (сервер — источник правды) ----------
    let requestedLimit = clampInt(body.limit, 1, 5000, 50);
    let days = clampInt(body.days, 1, 90, 7);
    let skipShort = body.skipShort === true;
    let minDurationSec = clampInt(body.minDurationSec, 5, 3600, billableMin);

    // FREE: фиксируем правила полностью
    if (planKey === "free") {
      requestedLimit = 30;     // ровно 30 "боевых" за прогон (если осталось меньше — getQuotaForImport обрежет)
      days = 7;                // фикс период
      skipShort = true;        // фикс фильтр коротких
      minDurationSec = billableMin; // фикс 30 сек (или billableMin)
    } else {
      // платные: не ниже billableMin (если включён фильтр)
      if (skipShort) minDurationSec = Math.max(minDurationSec, billableMin);
    }

    // ---------- КВОТА: сколько реально можно импортировать ----------
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
          skippedShort: 0,
          plan: quotaForRun.plan,
          quota: quotaForRun,
          message:
            "Доступных звонков по квоте не осталось. Обнови тариф, чтобы продолжить синхронизацию.",
        },
        { status: 200 }
      );
    }

    // safety cap на платных, чтобы не уронить бэк (по желанию)
    let safeEffectiveLimit = effectiveLimit;
    if (planKey !== "free") safeEffectiveLimit = Math.min(safeEffectiveLimit, 2000);

    // ---------- ИМПОРТ ИЗ AMO ----------
    const amoResult = (await syncAmoRecentCalls({
      companyId,
      limit: safeEffectiveLimit,
      // если ты умеешь в amocrm sync фильтровать по дате/длительности — передай туда:
      // days,
      // minDurationSec: skipShort ? minDurationSec : undefined,
    } as any)) as AmoSyncResult;

    const createdCount = typeof amoResult?.created === "number" ? amoResult.created : 0;

    // ---------- ОПЦИОНАЛЬНО: ЧИСТИМ КОРОТКИЕ (если ты пока фильтруешь пост-фактум) ----------
    // В идеале: фильтровать ДО записи в db, но если сейчас так — оставляем.
    let skippedShort = 0;

    if (skipShort) {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const del = await db.call.deleteMany({
        where: {
          companyId,
          createdAt: { gte: since },
          duration: { lt: minDurationSec },
        },
      });

      skippedShort = del.count;
    }

    // ---------- ВОЗВРАЩАЕМ ОБНОВЛЁННУЮ КВОТУ ПОСЛЕ ИМПОРТА ----------
    const updatedQuota = await getCallsQuota(companyId);

    return NextResponse.json(
      {
        ok: true,
        requestedLimit,
        limit: safeEffectiveLimit,
        days,
        skipShort,
        minDurationSec: skipShort ? minDurationSec : null,
        created: createdCount,
        skippedShort,
        plan: updatedQuota.plan,
        quota: updatedQuota,
        message: `Импорт выполнен: создано ${createdCount} новых звонков из amoCRM. Коротких удалено: ${skippedShort}.`,
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
          error:
            "Токен AmoCRM истёк или невалиден. Переподключи интеграцию AmoCRM.",
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
