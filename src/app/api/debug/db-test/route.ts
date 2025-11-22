// src/app/api/debug/db-test/route.ts

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Временный debug-эндпоинт для проверки подключения к БД на проде.
 * НИЧЕГО не требует, просто пробует сделать простой запрос.
 * Потом его можно будет удалить.
 */
export async function GET() {
  try {
    // Пробуем просто посчитать количество компаний
    const companyCount = await db.company.count();

    return NextResponse.json({
      ok: true,
      message: "DB connection OK",
      companyCount,
    });
  } catch (err: any) {
    console.error("DB TEST ERROR:", err);

    return NextResponse.json(
      {
        ok: false,
        message: "DB connection FAILED",
        error: String(err?.message || err),
        // иногда Prisma кладёт полезные детали в meta / code
        code: (err as any)?.code ?? null,
      },
      { status: 500 }
    );
  }
}
