// src/app/api/cron/process-calls/route.ts
import { NextRequest, NextResponse } from "next/server";
import { processNewCallsBatch } from "@/lib/call-processing";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET;

function checkSecret(req: NextRequest) {
  const secretFromQuery = req.nextUrl.searchParams.get("secret");
  if (!CRON_SECRET || secretFromQuery !== CRON_SECRET) {
    return false;
  }
  return true;
}

export async function GET(req: NextRequest) {
  if (!checkSecret(req)) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.max(1, Math.min(50, Number(limitParam))) : 10;

  try {
    const result = await processNewCallsBatch(limit);

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err: any) {
    console.error("[cron/process-calls] Error:", err);
    return NextResponse.json(
      {
        ok: false,
        message: err?.message ?? "Unexpected error",
      },
      { status: 500 }
    );
  }
}
