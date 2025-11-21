import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";
import bcrypt from "bcrypt";
import { Role } from "@prisma/client";

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
    });

    if (existing) {
      return NextResponse.json(
        { error: "Пользователь с таким email уже существует" },
        { status: 400 }
      );
    }

    const company = await db.company.create({
      data: {
        name: body.companyName,
        phone: body.phone,
      },
    });

    const passwordHash = await bcrypt.hash(body.password, 10);

    const user = await db.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash,
        role: Role.OWNER,
        companyId: company.id,
      },
    });

    await db.subscription.create({
      data: {
        companyId: company.id,
        plan: "FREE",
        seats: 5,
        pricePerMonthKZT: 0,
        status: "ACTIVE",
      },
    });

    return NextResponse.json({ success: true, userId: user.id }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Ошибка регистрации" },
      { status: 500 }
    );
  }
}



