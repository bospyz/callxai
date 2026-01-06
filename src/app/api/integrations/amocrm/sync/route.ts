// src/app/api/integrations/amocrm/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithCompany } from "@/lib/auth-guard";
import { syncAmoRecentCalls } from "@/lib/amocrm-sync";
import { amoRequest } from "@/lib/amocrm";

export async function POST(req: NextRequest) {
  console.log("[AMO SYNC ROUTE] POST hit");

  try {
    const { companyId } = await requireAuthWithCompany();

    const body = await req.json().catch(() => ({}));

    const limit =
      body?.limit === null || body?.limit === undefined
        ? undefined
        : Number(body.limit);

    const minDurationSec =
      typeof body?.minDurationSec === "number" ? body.minDurationSec : 0;

    const mode =
      body?.mode === "calls" ||
      body?.mode === "events" ||
      body?.mode === "notes" ||
      body?.mode === "auto"
        ? body.mode
        : "auto";

    // UI шлёт dateFrom/dateTo (YYYY-MM-DD)
    const dateFrom = typeof body?.dateFrom === "string" ? body.dateFrom : null;
    const dateTo = typeof body?.dateTo === "string" ? body.dateTo : null;

    // Для syncAmoRecentCalls мы хотим ISO
    const dateFromIso = dateFrom
      ? new Date(`${dateFrom}T00:00:00.000Z`).toISOString()
      : undefined;
    const dateToIso = dateTo
      ? new Date(`${dateTo}T23:59:59.999Z`).toISOString()
      : undefined;

    // 1) Диагностика токена/доступа
    let accountName: string | null = null;
    let accountError: any = null;
    try {
      const acc = await amoRequest<any>({
        companyId,
        method: "GET",
        path: "/api/v4/account",
      });
      accountName = acc?.name ?? acc?._links?.self?.href ?? "ok";
    } catch (e: any) {
      accountError = {
        message: e?.message ?? String(e),
        status: e?.status ?? null,
      };
    }

    // 2) Сам sync
    const result = await syncAmoRecentCalls({
      companyId,
      mode,
      limit: Number.isFinite(limit as any) ? (limit as number) : undefined,
      minDurationSec,
      dateFromIso,
      dateToIso,

      perPage: 50,
      scanMax: 50_000,
      overlapSec: 600,
      pageDelayMs: 150,
    });

    console.log("[AMO SYNC ROUTE] done", {
      accountName,
      accountError,
      result: {
        ok: result.ok,
        created: result.created,
        scanned: result.scanned,
        mode: result.mode,
        stoppedBy: result.stoppedBy,
      },
    });

    return NextResponse.json({
      ok: true,
      accountName,
      accountError,
      result,
    });
  } catch (e: any) {
    console.error("[AMO SYNC ROUTE] ERROR", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "sync_failed" },
      { status: 500 }
    );
  }
}
