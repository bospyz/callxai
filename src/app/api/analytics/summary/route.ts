import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCompanyAnalytics } from "@/lib/analytics/AnalyticsService";

export async function GET(req: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const companyId = (session.user as any).companyId as string | undefined;
  if (!companyId) {
    return new NextResponse("No companyId in session", { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const daysParam = searchParams.get("days");
  const days = daysParam ? Number(daysParam) : 30;

  try {
    const analytics = await getCompanyAnalytics(companyId, isNaN(days) ? 30 : days);
    return NextResponse.json({ ok: true, analytics });
  } catch (err) {
    console.error("[API] /api/analytics/summary error", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
