import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthWithCompany } from "@/lib/auth-guard";
import { CallStatus } from "@prisma/client";

function parsePeriod(periodParam: string | null): number {
  if (!periodParam) return 7; // дефолт 7 дней

  const match = /^(\d+)([hdw])$/.exec(periodParam);
  if (!match) return 7;

  const value = Number(match[1]);
  const unit = match[2];

  if (!Number.isFinite(value) || value <= 0) return 7;

  switch (unit) {
    case "d":
      return value;
    case "w":
      return value * 7;
    case "h":
      // для часов берём минимум 1 день, чтобы не ловить баги
      return 1;
    default:
      return 7;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await requireAuthWithCompany();

    const { searchParams } = new URL(req.url);
    const periodParam = searchParams.get("period");
    const statusParam = searchParams.get("status");
    const limitParam = searchParams.get("limit");

    const days = parsePeriod(periodParam);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const where: any = {
      companyId,
      createdAt: {
        gte: since,
      },
    };

    if (statusParam && statusParam !== "all") {
      const upper = statusParam.toUpperCase();
      if (upper in CallStatus) {
        where.status = upper as CallStatus;
      }
    }

    let take = 200;
    if (limitParam) {
      const n = Number(limitParam);
      if (!Number.isNaN(n) && n > 0) {
        take = Math.min(n, 500);
      }
    }

    const calls = await db.call.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      take,
    });

    return NextResponse.json({
      ok: true,
      calls,
    });
  } catch (err: any) {
    const msg = String(err?.message || err);

    if (msg.startsWith("Unauthorized")) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    if (msg.includes("No companyId in session")) {
      return new NextResponse("No companyId in session", { status: 400 });
    }

    console.error("[API] /api/calls error", err);
    return new NextResponse(
      err?.message ? `Failed to load calls: ${err.message}` : "Failed to load calls",
      { status: 500 }
    );
  }
}
