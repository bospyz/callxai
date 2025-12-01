import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SubscriptionStatus } from "@prisma/client";
import { canCompanyIngestCall } from "@/lib/call-quota";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const user = session.user as any;
    const companyId = user.companyId as string | undefined;

    if (!companyId) {
      return new NextResponse("No companyId in session", { status: 400 });
    }

    // Активная подписка (если есть)
    const activeSub = await db.subscription.findFirst({
      where: {
        companyId,
        status: SubscriptionStatus.ACTIVE,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const quota = await canCompanyIngestCall(companyId);

    return NextResponse.json({
      ok: true,
      companyId,
      plan: activeSub ? activeSub.plan : "FREE",
      hasActiveSub: !!activeSub,
      reason: quota.reason,
      limit: quota.limit, // 30 для фри, 2000 для базовой, null для безлимитных
      used: quota.callsCount,
      remaining: quota.remaining,
      billableMinDurationSec: quota.billableMinDurationSec,
    });
  } catch (err) {
    console.error("[API] /api/billing/quota error", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
