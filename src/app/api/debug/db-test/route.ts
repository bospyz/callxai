// src/app/api/debug/db-test/route.ts

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Временный debug-эндпоинт для проверки подключения к БД на проде.
 * Потом его можно будет удалить.
 */
export async function GET() {
  try {
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
        code: (err as any)?.code ?? null,
      },
      { status: 500 }
    );
  }
}
