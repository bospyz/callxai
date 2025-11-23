// src/app/api/cron/sync-calls/route.ts

import { NextRequest, NextResponse } from "next/server";
import { syncAmoRecentCalls } from "@/lib/amocrm";
import { logError } from "@/lib/logger/Sentry";

/**
 * CRON-синк звонков из amoCRM.
 * Поддерживаем GET и POST, чтобы работало и с Vercel Cron, и с ручными вызовами.
 */
async function handleSync(req: NextRequest) {
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
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    logError?.(err, { context: "CRON sync error", companyId });
    console.error("CRON sync error:", err);

    return NextResponse.json(
      {
        ok: false,
        message: "Internal error",
      },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return handleSync(req);
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}
