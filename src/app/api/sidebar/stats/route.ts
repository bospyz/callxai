// src/app/api/sidebar/stats/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0
    );
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    );

    // тут подставь реальные поля из твоей модели Call
    const callsInWork = await prisma.call.count({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
        // пример: статус "в работе"
        status: "IN_PROGRESS",
      },
    });

    // пока просто жестко задаём план, потом можешь брать из Company
    const dailyPlan = 188;

    const planPercent =
      dailyPlan > 0 ? Math.min(100, Math.round((callsInWork / dailyPlan) * 100)) : 0;

    return NextResponse.json({
      callsInWork,
      planPercent,
    });
  } catch (error) {
    console.error("[SIDEBAR_STATS]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
