// src/app/api/cron/sync-calls/route.ts

import { NextRequest, NextResponse } from "next/server";
import { syncAmoRecentCalls, hasActivePaidSubscription } from "@/lib/amocrm";

async function handleSync(req: NextRequest) {
  const url = req.nextUrl;
  const secret = url.searchParams.get("secret");
  const companyId = url.searchParams.get("companyId");
  const limitParam = url.searchParams.get("limit");

  if (!secret || secret !== process.env.CRON_SECRET) {
    return new NextResponse("Forbidden: invalid cron secret", { status: 403 });
  }

  if (!companyId) {
    return new NextResponse("Missing companyId", { status: 400 });
  }

  const limit = limitParam ? Number(limitParam) || undefined : undefined;

  // (опционально) режем по подписке
  try {
    const hasSub = await hasActivePaidSubscription(companyId);
    if (!hasSub) {
      return NextResponse.json(
        {
          ok: false,
          message: "No active paid subscription for this company",
        },
        { status: 402 }
      );
    }
  } catch (err) {
    console.error("[cron/sync-calls] failed to check subscription", err);
  }

  try {
    const result = await syncAmoRecentCalls({ companyId, limit });

    return NextResponse.json({
      ok: true,
      companyId,
      ...result,
    });
  } catch (err: any) {
    console.error("[cron/sync-calls] Error:", err);

    const message =
      err instanceof Error ? err.message : "Internal error during sync";

    return NextResponse.json(
      {
        ok: false,
        companyId,
        message,
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleSync(req);
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}
