// src/app/api/cron/cleanup-calls/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * CRON-очистка старых звонков (старше 30 дней).
 * GET/POST для совместимости с Vercel Cron.
 */
async function handleCleanup(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");

  if (!secret || secret !== process.env.CRON_SECRET) {
    return new NextResponse("Forbidden: invalid cron secret", { status: 403 });
  }

  try {
    const threshold = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30); // 30 дней

    const deleted = await db.call.deleteMany({
      where: { createdAt: { lt: threshold } },
    });

    return NextResponse.json({
      ok: true,
      deleted: deleted.count,
    });
  } catch (err: any) {
    console.error("CRON cleanup error:", err);

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
  return handleCleanup(req);
}

export async function POST(req: NextRequest) {
  return handleCleanup(req);
}
