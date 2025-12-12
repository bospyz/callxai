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

    // ----------------------
    // Чтение и нормализация body
    // ----------------------
    let body: SyncBody = {};
    try {
      body = (await req.json()) as SyncBody;
    } catch {
      body = {};
    }

    // Лимит запрашиваемых звонков
    let requestedLimit = Number(body.limit) || 50;
    if (requestedLimit < 10) requestedLimit = 10;
    if (requestedLimit > 500) requestedLimit = 500;

    // Кол-во дней (для фильтрации коротких звонков)
    let days = Number(body.days) || 7;
    if (days < 1) days = 1;
    if (days > 90) days = 90;

    const skipShort = body.skipShort === true;

    let minDurationSec = Number(body.minDurationSec) || 30;
    if (minDurationSec < 5) minDurationSec = 5;
    if (minDurationSec > 3600) minDurationSec = 3600;

    // ----------------------
    // Проверяем квоту
    // ----------------------
    const { allowed: effectiveLimit, quota } = await getQuotaForImport(
      companyId,
      requestedLimit
    );

    const limitReached =
      quota.limit !== null &&
      (effectiveLimit <= 0 || (quota.remaining ?? 0) <= 0);

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

    // Если квота позволяет, но effectiveLimit всё равно 0 → ничего не тянем
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
    // Выполняем импорт звонков из AmoCRM
    // ----------------------
    const amoResult = await syncAmoRecentCalls({
      companyId,
      limit: effectiveLimit,
    } as any);

    const createdCount =
      typeof amoResult?.created === "number" ? amoResult.created : 0;

    // ----------------------
    // Опционально удаляем короткие звонки
    // ----------------------
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

    // ----------------------
    // Ответ API
    // ----------------------
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
        freeLimit: quota.limit, // для совместимости
        freeRemaining: quota.remaining,
        message: `Импорт выполнен: создано ${createdCount} новых звонков из AmoCRM. Фильтр коротких: ${skippedShort}.`,
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
