// src/app/api/billing/quota/route.ts

import { NextResponse } from "next/server";
import { requireAuthWithCompany } from "@/lib/auth-guard";
import { getRemainingCallsQuota } from "@/lib/call-quota";

export async function GET() {
  try {
    const { companyId } = await requireAuthWithCompany();

    const quota = await getRemainingCallsQuota(companyId);

    return NextResponse.json(
      {
        ok: true,
        quota,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[GET /api/billing/quota] error", err);
    const msg = String(err?.message || err);

    if (msg.startsWith("Unauthorized")) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    return new NextResponse(
      err?.message
        ? `Failed to load quota: ${err.message}`
        : "Failed to load quota",
      { status: 500 }
    );
  }
}
