import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithCompany } from "@/lib/auth-guard";
import { db } from "@/lib/db";

function isISODateOnly(s: string) {
  // YYYY-MM-DD
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Минимально корректная “локальная дата” для Алматы (+05:00)
// dateFrom: 2025-12-19 -> 2025-12-19T00:00:00.000+05:00
function toAlmatyDayStart(dateOnly: string) {
  return new Date(`${dateOnly}T00:00:00.000+05:00`);
}
function toAlmatyDayEnd(dateOnly: string) {
  return new Date(`${dateOnly}T23:59:59.999+05:00`);
}

/**
 * POST /api/integrations/amocrm/sync/preview
 * body: { dateFrom, dateTo, skipShort?, minDurationSec?, debugUseCreatedAt? }
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId } = await requireAuthWithCompany();

    const body = await req.json().catch(() => ({}));

    const dateFrom = String(body?.dateFrom || "").trim();
    const dateTo = String(body?.dateTo || "").trim();
    const skipShort = Boolean(body?.skipShort);
    const minDurationSec =
      typeof body?.minDurationSec === "number" ? body.minDurationSec : 0;

    // debug: если хочешь быстро проверить “calls в БД есть, но occurredAt кривой”
    const debugUseCreatedAt = Boolean(body?.debugUseCreatedAt);

    if (!dateFrom || !dateTo) {
      return NextResponse.json({ ok: false, error: "Укажи даты периода" }, { status: 400 });
    }

    if (!isISODateOnly(dateFrom) || !isISODateOnly(dateTo)) {
      return NextResponse.json(
        { ok: false, error: "Неверный формат даты. Нужно YYYY-MM-DD" },
        { status: 400 }
      );
    }

    if (dateFrom > dateTo) {
      return NextResponse.json(
        { ok: false, error: "Дата 'с' не может быть позже даты 'по'" },
        { status: 400 }
      );
    }

    // Алматы-окно (важно для корректного “день в день”)
    const from = toAlmatyDayStart(dateFrom);
    const to = toAlmatyDayEnd(dateTo);

    const timeField = debugUseCreatedAt ? "createdAt" : "occurredAt";

    const where: any = {
      companyId,
      [timeField]: { gte: from, lte: to },
    };

    if (skipShort && minDurationSec > 0) {
      where.duration = { gte: minDurationSec };
    }

    const [count, total, nullOccurredAt] = await Promise.all([
      db.call.count({ where }),
      db.call.count({ where: { companyId } }),
      db.call.count({ where: { companyId, occurredAt: null } }),
    ]);

    return NextResponse.json({
      ok: true,
      count,
      debug: {
        companyId,
        timeField,
        window: { from: from.toISOString(), to: to.toISOString() },
        totalCallsForCompany: total,
        callsWithNullOccurredAt: nullOccurredAt,
        skipShort,
        minDurationSec,
      },
    });
  } catch (e: any) {
    console.error("[SYNC PREVIEW DB ERROR]", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Не удалось посчитать звонки за период" },
      { status: 500 }
    );
  }
}
