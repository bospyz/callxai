// src/app/api/cron/process-calls/route.ts

import { NextRequest, NextResponse } from "next/server";
import { processNewCallsBatch } from "@/lib/call-processing";

async function handleProcess(req: NextRequest) {
  const url = req.nextUrl;
  const secret = url.searchParams.get("secret");
  const limitParam = url.searchParams.get("limit");

  if (!secret || secret !== process.env.CRON_SECRET) {
    return new NextResponse("Forbidden: invalid cron secret", { status: 403 });
  }

  const limit = limitParam ? Number(limitParam) || 10 : 10;

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
        message:
          err instanceof Error ? err.message : "Internal error during process",
      },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return handleProcess(req);
}

export async function POST(req: NextRequest) {
  return handleProcess(req);
}
