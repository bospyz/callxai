// src/app/api/debug/env/route.ts

import { NextResponse } from "next/server";

export async function GET() {
  const dbUrl = process.env.DATABASE_URL;

  return NextResponse.json({
    hasDatabaseUrl: !!dbUrl,
    // первые 30 символов, чтобы увидеть, что там вообще за строка
    databaseUrlPrefix: dbUrl ? dbUrl.slice(0, 30) : null,
    // на всякий, чтобы понять окружение
    nodeEnv: process.env.NODE_ENV ?? null,
  });
}
