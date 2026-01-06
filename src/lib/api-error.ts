import { NextResponse } from "next/server";
import { HttpError } from "@/lib/http-error";

export function apiError(e: unknown) {
  // HttpError -> правильный HTTP статус
  if (e instanceof HttpError) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  }

  // Prisma/прочие ошибки — логируем
  console.error(e);

  return NextResponse.json(
    { ok: false, error: "Internal error" },
    { status: 500 }
  );
}
