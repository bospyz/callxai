import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  const user = session?.user as any;

  if (!user?.companyId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { sessionId } = await req.json();

  if (!sessionId) {
    return new NextResponse("Missing sessionId", { status: 400 });
  }

  try {
    // Получаем данные о платеже
    const checkout = await stripe.checkout.sessions.retrieve(sessionId);

    if (checkout.payment_status !== "paid") {
      return new NextResponse("Payment not completed", { status: 400 });
    }

    // Активируем подписку в БД
    const existingSub = await db.subscription.findFirst({
      where: { companyId: user.companyId },
    });

    if (existingSub) {
      await db.subscription.update({
        where: { id: existingSub.id },
        data: {
          plan: "PRO",
          status: "ACTIVE",
        },
      });
    } else {
      await db.subscription.create({
        data: {
          plan: "PRO",
          status: "ACTIVE",
          companyId: user.companyId,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Billing confirm error:", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
