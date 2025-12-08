// src/app/api/integrations/amocrm/sync/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithCompany } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { syncAmoRecentCalls } from "@/lib/amocrm";
import { getQuotaForImport } from "@/lib/call-quota";

type SyncBody = {
  limit?: number;
  days?: number;
  skipShort?: boolean;
  minDurationSec?: number;
};

function buildLimitReachedMessage(plan: string, limit: number | null) {
  if (limit == null) {
    return "Лимит по звонкам не ограничен, но импорт временно недоступен.";
  }

  if (plan === "free") {
    return `Лимит в ${limit} бесплатных звонков исчерпан. Подключи тариф START на странице биллинга, чтобы продолжить анализ звонков.`;
  }

  // START / PRO / др.
  return `Лимит в ${limit} звонков по текущему тарифу исчерпан. Обнови тариф или свяжись с поддержкой, чтобы увеличить лимит.`;
}

export async function POST(req: NextRequest) {
  try {
    const { companyId } = await requireAuthWithCompany();

    let body: SyncBody | null = null;
    try {
      body = (await req.json()) as SyncBody;
    } catch {
      body = null;
    }

    // Лимит запрашиваемых звонков из тела
    const rawLimit = body?.limit;
    let requestedLimit = typeof rawLimit === "number" ? rawLimit : 50;
    if (!Number.isFinite(requestedLimit) || requestedLimit <= 0)
      requestedLimit = 50;
    if (requestedLimit < 10) requestedLimit = 10;
    if (requestedLimit > 500) requestedLimit = 500;

    // Период в днях (для очистки коротких звонков)
    const rawDays = body?.days;
    let days = typeof rawDays === "number" ? rawDays : 7;
    if (!Number.isFinite(days) || days <= 0) days = 7;
    if (days < 1) days = 1;
    if (days > 90) days = 90;

    // Пропуск коротких звонков
    const skipShort = body?.skipShort === true;
    const rawMinDur = body?.minDurationSec;
    let minDurationSec = typeof rawMinDur === "number" ? rawMinDur : 30;
    if (minDurationSec < 5) minDurationSec = 5;
    if (minDurationSec > 3600) minDurationSec = 3600;

    // ✅ Считаем, сколько звонков реально можно подгрузить по квоте
    const { allowed: effectiveLimit, quota } = await getQuotaForImport(
      companyId,
      requestedLimit
    );

    // Если лимит выбит — ничего не грузим
    if (quota.limit !== null && effectiveLimit <= 0) {
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

    // Если effectiveLimit всё равно 0 (на всякий случай) — просто возвращаем инфу
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
          freeLimit: quota.limit, // оставил поля для совместимости с фронтом
          freeRemaining: quota.remaining,
          message:
            "Доступных звонков по квоте не осталось. Обнови тариф, чтобы продолжить синхронизацию.",
        },
        { status: 200 }
      );
    }

    // 🔄 Синхронизируем последние звонки из amoCRM с учётом effectiveLimit
    const result: any = await syncAmoRecentCalls({
      companyId,
      limit: effectiveLimit,
    } as any);

    // Если включён фильтр коротких — подчистим базу по длительности
    let skippedShort = 0;
    if (skipShort) {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const delResult = await db.call.deleteMany({
        where: {
          companyId,
          createdAt: { gte: since },
          duration: { lt: minDurationSec },
        },
      });

      skippedShort = delResult.count;
    }

    const createdCount =
      typeof result?.created === "number" ? result.created : null;

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
        plan: quota.plan,
        quota,
        freeLimit: quota.limit, // для старого фронта
        freeRemaining: quota.remaining,
        message: `Синхронизировали звонки из amoCRM (запрошено ${requestedLimit}, лимит по квоте ${effectiveLimit}, период ~${days} дней, удалено коротких: ${skippedShort}).`,
      },
      { status: 200 }
    );
  } catch (err: any) {
    const msg = String(err?.message || err);

    // токен amoCRM истёк / невалиден — даём понятный ответ
    if (msg.includes("amoCRM access token expired or invalid")) {
      console.warn("[AMO] access token expired, need reconnect");
      return NextResponse.json(
        {
          ok: false,
          code: "AMO_TOKEN_EXPIRED",
          error:
            "Токен amoCRM устарел или невалиден. Переподключи интеграцию amoCRM на этой странице.",
        },
        { status: 401 }
      );
    }

    if (msg.startsWith("Unauthorized")) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    if (msg.includes("No companyId in session")) {
      return new NextResponse("No companyId in session", { status: 400 });
    }

    console.error("[API] /api/integrations/amocrm/sync error", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
