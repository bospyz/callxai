import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const BillingRequestSchema = z.object({
  plan: z.string().min(1),
  fullName: z.string().min(1),
  companyName: z.string().min(1),
  phone: z.string().min(5),
  email: z.string().email(),
  billingDetails: z.string().optional(),
  comment: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const user = session.user as any;
    const companyId = user.companyId as string | undefined;

    if (!companyId) {
      return NextResponse.json(
        { ok: false, error: "No company in session" },
        { status: 400 }
      );
    }

    const json = await req.json();
    const parsed = BillingRequestSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Некорректные данные заявки",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { plan, fullName, companyName, phone, email } = parsed.data;

    await db.paymentRequest.create({
      data: {
        companyId,
        plan,
        fullName,
        companyName,
        phone,
        email,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        message: "Заявка на оплату успешно создана. Мы свяжемся с вами.",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[billing/request] error", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Внутренняя ошибка сервера при создании заявки на оплату",
      },
      { status: 500 }
    );
  }
}
