// src/app/api/cron/sync-calls/route.ts

import { NextRequest, NextResponse } from "next/server";

/**
 * Временный stub для CRON-синхронизации звонков.
 * Проверяем secret и companyId, чтобы убедиться,
 * что маршрут и крон работают.
 */

async function handleSync(req: NextRequest) {
  const url = req.nextUrl;
  const secret = url.searchParams.get("secret");
  const companyId = url.searchParams.get("companyId");

  if (!secret || secret !== process.env.CRON_SECRET) {
    return new NextResponse("Forbidden: invalid cron secret", { status: 403 });
  }

  if (!companyId) {
    return new NextResponse("Missing companyId", { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    message: "Cron sync stub OK",
    companyId,
  });
}

export async function GET(req: NextRequest) {
  return handleSync(req);
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}
