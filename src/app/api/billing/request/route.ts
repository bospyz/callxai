// src/app/api/billing/request/route.ts

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const RequestSchema = z.object({
  plan: z.enum(["start", "pro", "enterprise"]),
  fullName: z.string().min(2),
  companyName: z.string().min(2),
  phone: z.string().min(5),
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const user = session?.user as any;
    const companyId = user?.companyId as string | undefined;

    if (!companyId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Нет companyId в сессии. Перелогинься или заново создай аккаунт компании.",
        },
        { status: 400 }
      );
    }

    const json = await req.json();
    const parsed = RequestSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Некорректные данные заявки",
          issues: parsed.error.format(),
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
        // status не передаём — по схеме по умолчанию PENDING
      },
    });

    return NextResponse.json(
      {
        ok: true,
        message:
          "Заявка на подключение тарифа отправлена. Мы свяжемся с тобой, чтобы подключить план.",
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[API] /api/billing/request error", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
