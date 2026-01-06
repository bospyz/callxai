import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { z } from "zod";
import { Role } from "@prisma/client";

import { db } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { HttpError } from "@/lib/http-error";

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  companyName: z.string().min(1),
  phone: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const body = schema.parse(json);

    const existing = await db.user.findUnique({
      where: { email: body.email },
      select: { id: true },
    });

    if (existing) {
      throw new HttpError(400, "Пользователь с таким email уже существует");
    }

    const passwordHash = await bcrypt.hash(body.password, 10);

    // Важно: транзакция, чтобы не остались “висячие” company/subscription при сбое
    const result = await db.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: body.companyName,
          phone: body.phone,
        },
        select: { id: true },
      });

      const user = await tx.user.create({
        data: {
          email: body.email,
          name: body.name,
          passwordHash,
          role: Role.OWNER,
          companyId: company.id,
        },
        select: { id: true },
      });

      // Если у тебя в Prisma plan/status — enum’ы, оставь как есть.
      await tx.subscription.create({
        data: {
          companyId: company.id,
          plan: "FREE",
          seats: 5,
          pricePerMonthKZT: 0,
          status: "ACTIVE",
        },
        select: { id: true },
      });

      return { companyId: company.id, userId: user.id };
    });

    return NextResponse.json(
      { ok: true, userId: result.userId, companyId: result.companyId },
      { status: 201 }
    );
  } catch (e: any) {
    // zod -> 400 с деталями
    if (e?.name === "ZodError") {
      return NextResponse.json(
        { ok: false, error: "Некорректные данные", details: e.errors },
        { status: 400 }
      );
    }

    return apiError(e);
  }
}
