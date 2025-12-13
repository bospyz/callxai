import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithCompany } from "@/lib/auth-guard";
import { getAnalyticsSummary } from "@/lib/analytics/AnalyticsSummaryService";

function parsePeriod(period: string | null) {
  // поддержка: 7d / 30d / 90d / 365d
  // если придёт "30d" — ок
  const p = (period ?? "30d").toLowerCase().trim();
  const m = p.match(/^(\d+)\s*d$/);
  if (!m) return { days: 30, period: "30d" };
  const days = Math.max(1, Math.min(3650, Number(m[1])));
  return { days, period: `${days}d` };
}

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await requireAuthWithCompany();

    const { searchParams } = new URL(req.url);
    const { days, period } = parsePeriod(searchParams.get("period"));

    const summary = await getAnalyticsSummary(companyId, days);

    return NextResponse.json({
      ok: true,
      period,
      ...summary,
    });
  } catch (err: any) {
    const msg = String(err?.message || err);

    if (msg.startsWith("Unauthorized")) return new NextResponse("Unauthorized", { status: 401 });
    if (msg.includes("No companyId in session")) return new NextResponse("No companyId in session", { status: 400 });

    console.error("[API] /api/analytics/summary error", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
