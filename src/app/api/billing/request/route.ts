import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

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
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const {
      plan,
      fullName,
      companyName,
      phone,
      email,
      billingDetails,
      comment,
    } = body as {
      plan?: string;
      fullName?: string;
      companyName?: string;
      phone?: string;
      email?: string;
      billingDetails?: string;
      comment?: string;
    };

    if (!plan || !fullName || !companyName || !phone || !email) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Заполните все обязательные поля: план, ФИО, название компании, телефон, e-mail",
        },
        { status: 400 }
      );
    }

    await db.paymentRequest.create({
      data: {
        companyId,
        plan,
        fullName,
        companyName,
        phone,
        email,
        // billingDetails, comment можно будет добавить в модель позже
      },
    });

    return NextResponse.json(
      {
        ok: true,
        message:
          "Заявка на оплату принята. Мы свяжемся с вами по указанным контактам.",
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
