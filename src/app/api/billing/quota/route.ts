import { NextResponse } from "next/server";
import { requireAuthWithCompany } from "@/lib/auth-guard";
import { getRemainingCallsQuota } from "@/lib/call-quota";

function getNextResetAt(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toISOString();
}

export async function GET() {
  try {
    const { companyId } = await requireAuthWithCompany();

    const quota = await getRemainingCallsQuota(companyId);

    const nextResetAt = getNextResetAt();

    return NextResponse.json(
      {
        ok: true,
        quota,
        billing: {
          plan: quota.plan,
          period: "month",
          resetAt: nextResetAt,
          // удобные флаги для фронта
          unlimited: quota.limit === null,
          limit: quota.limit,
          used: quota.used,
          remaining: quota.remaining,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[GET /api/billing/quota] error", err);
    const msg = String(err?.message || err);

    if (msg.startsWith("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (msg.includes("No companyId in session")) {
      return NextResponse.json(
        { error: "No companyId in session" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: err?.message || "Failed to load quota",
      },
      { status: 500 }
    );
  }
}
