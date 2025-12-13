// src/app/api/analytics/dashboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithCompany } from "@/lib/auth-guard";
import { getCompanyDashboard } from "@/lib/analytics/AnalyticsService";

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await requireAuthWithCompany();

    const { searchParams } = new URL(req.url);
    const daysParam = searchParams.get("days");
    const days = daysParam ? Number(daysParam) : 30;
    const safeDays = Number.isNaN(days) ? 30 : Math.min(Math.max(days, 1), 365);

    const dashboard = await getCompanyDashboard(companyId, safeDays);

    return NextResponse.json({ ok: true, dashboard });
  } catch (err: any) {
    const msg = String(err?.message || err);

    if (msg.startsWith("Unauthorized")) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    if (msg.includes("No companyId in session")) {
      return new NextResponse("No companyId in session", { status: 400 });
    }

    console.error("[API] /api/analytics/dashboard error", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
