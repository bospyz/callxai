import { NextRequest, NextResponse } from "next/server";
import { syncAmoRecentCalls } from "@/lib/amocrm";
import { logError } from "@/lib/logger/Sentry";

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const companyId = req.nextUrl.searchParams.get("companyId");

  if (!secret || secret !== process.env.CRON_SECRET) {
    return new NextResponse("Forbidden: invalid cron secret", { status: 403 });
  }

  if (!companyId) {
    return new NextResponse("Missing companyId", { status: 400 });
  }

  try {
    const result = await syncAmoRecentCalls({ companyId });
    return NextResponse.json({ ...result, ok: true });
  } catch (err) {
    logError(err, { context: "CRON sync error" });
    return new NextResponse("Internal Error", { status: 500 });
  }
}
