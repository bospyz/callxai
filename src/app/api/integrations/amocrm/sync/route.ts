import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithCompany } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { syncAmoRecentCalls } from "@/lib/amocrm";
import { canCompanyIngestCall } from "@/lib/call-quota";

type SyncBody = {
  limit?: number;
  days?: number;
  skipShort?: boolean;
  minDurationSec?: number;
};

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
    let limit = typeof rawLimit === "number" ? rawLimit : 50;
    if (!Number.isFinite(limit) || limit <= 0) limit = 50;
    if (limit < 10) limit = 10;
    if (limit > 500) limit = 500;

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

    // ✅ Проверка квоты компании (30 бесплатных звонков без подписки)
    const quota = await canCompanyIngestCall(companyId);

    if (!quota.allowed) {
      // Уже превысили бесплатный лимит
      return NextResponse.json(
        {
          ok: false,
          error: `Лимит в ${quota.limit} бесплатных звонков исчерпан. Подключи подписку на странице биллинга, чтобы продолжить анализ звонков.`,
          code: "FREE_LIMIT_REACHED",
          limit: quota.limit,
        },
        { status: 402 }
      );
    }

    // По дефолту используем тот limit, что пришёл в body
    let effectiveLimit = limit;

    // Если компания без подписки и в рамках бесплатного лимита —
    // режем фактический лимит по оставшимся звонкам.
    if (
      quota.reason === "within-free-limit" &&
      typeof quota.remaining === "number"
    ) {
      if (quota.remaining <= 0) {
        return NextResponse.json(
          {
            ok: false,
            error: `Лимит в ${quota.limit} бесплатных звонков исчерпан. Подключи подписку на странице биллинга, чтобы продолжить анализ звонков.`,
            code: "FREE_LIMIT_REACHED",
            limit: quota.limit,
          },
          { status: 402 }
        );
      }

      if (effectiveLimit > quota.remaining) {
        effectiveLimit = quota.remaining;
      }
    }

    // Если effectiveLimit оказался 0 — синкать нечего
    if (effectiveLimit <= 0) {
      return NextResponse.json(
        {
          ok: true,
          limit: 0,
          days,
          skipShort,
          minDurationSec: skipShort ? minDurationSec : null,
          created: 0,
          skippedShort: 0,
          freeLimit: quota.limit,
          freeRemaining: quota.remaining ?? null,
          message:
            "Доступных бесплатных звонков не осталось. Подключи подписку, чтобы продолжить синхронизацию.",
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

    return NextResponse.json({
      ok: true,
      limit: effectiveLimit,
      days,
      skipShort,
      minDurationSec: skipShort ? minDurationSec : null,
      created: createdCount,
      skippedShort,
      freeLimit: quota.limit,
      freeRemaining: quota.remaining ?? null,
      message: `Синхронизировали звонки из amoCRM (лимит ${effectiveLimit}, период ~${days} дней, удалено коротких: ${skippedShort}).`,
    });
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
