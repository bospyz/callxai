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
  email: z.string().email().optional().or(z.literal("")),
  billingDetails: z.string().min(3),
  comment: z.string().max(1000).optional().or(z.literal("")),
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
          error:
            "Нет companyId в сессии. Перелогинься или заново создай аккаунт компании.",
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
          error: "Некорректные данные",
          issues: parsed.error.format(),
        },
        { status: 400 }
      );
    }

    const { plan, fullName, companyName, phone, email, billingDetails, comment } =
      parsed.data;

    await db.paymentRequest.create({
      data: {
        companyId,
        plan,
        fullName,
        companyName,
        phone,
        // email в БД обязательный → всегда строка
        email: email || "",
        billingDetails,
        // comment: либо строка, либо пустая строка
        comment: comment || "",
      },
    });

    return NextResponse.json(
      {
        ok: true,
        message: "Заявка отправлена. Мы свяжемся с тобой.",
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Billing request error", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
