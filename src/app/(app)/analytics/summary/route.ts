import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithCompany } from "@/lib/auth-guard";
import { getCompanyAnalytics } from "@/lib/analytics/AnalyticsService";

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await requireAuthWithCompany();

    const { searchParams } = new URL(req.url);
    const days = Number(searchParams.get("days") ?? 30);

    const analytics = await getCompanyAnalytics(
      companyId,
      Number.isNaN(days) ? 30 : days
    );

    return NextResponse.json({ ok: true, analytics });
  } catch (e) {
    console.error("[analytics summary]", e);
    return new NextResponse("Internal error", { status: 500 });
  }
}
