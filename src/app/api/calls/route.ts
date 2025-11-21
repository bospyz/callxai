import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

function parsePeriod(periodParam: string | null): number {
  if (!periodParam) return 7; // дефолт  7 дней

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
      // для часов не будем плясать с датами  просто 1 день
      return 1;
    default:
      return 7;
  }
}

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
  const periodParam = searchParams.get("period");
  const days = parsePeriod(periodParam);

  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    const calls = await db.call.findMany({
      where: {
        companyId,
        createdAt: { gte: since },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 500,
    });

    return NextResponse.json({
      ok: true,
      calls,
    });
  } catch (err: any) {
    console.error("[API] /api/calls error", err);
    return new NextResponse(
      err?.message ? `Failed to load calls: ${err.message}` : "Failed to load calls",
      { status: 500 }
    );
  }
}
