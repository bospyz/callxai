import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createSubscriptionCheckout,
  type BillingPlan,
} from "@/lib/billing/BillingService";

const ALLOWED_PLANS: BillingPlan[] = ["start", "pro", "team"];

export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const companyId = (session.user as any).companyId as string | undefined;
  if (!companyId) {
    return new NextResponse("No companyId in session", { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const plan = body?.plan as BillingPlan | undefined;
  if (!plan || !ALLOWED_PLANS.includes(plan)) {
    return new NextResponse('Field "plan" must be one of: start, pro, team', {
      status: 400,
    });
  }

  const origin =
    req.headers.get("origin") ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";

  const successUrl = `${origin}/app/billing?status=success`;
  const cancelUrl = `${origin}/app/billing?status=cancel`;

  try {
    const sessionStripe = await createSubscriptionCheckout({
      companyId,
      plan,
      successUrl,
      cancelUrl,
    });

    return NextResponse.json({
      ok: true,
      url: sessionStripe.url,
      id: sessionStripe.id,
    });
  } catch (err: any) {
    console.error("[API] /api/billing/checkout error", err);
    return new NextResponse(
      err?.message ? `Checkout error: ${err.message}` : "Checkout error",
      { status: 500 }
    );
  }
}
