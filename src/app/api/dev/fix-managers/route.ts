// src/app/api/dev/fix-managers/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

/**
 * Резолвим managerId по amoUserId
 * (у Manager реально есть поле amoUserId — см. schema.prisma)
 */
async function resolveManagerIdForAmoUser(
  companyId: string,
  amoUserId: string | number
): Promise<string | null> {
  const manager = await db.manager.findFirst({
    where: {
      companyId,
      amoUserId: String(amoUserId),
    },
    select: { id: true },
  });

  return manager?.id ?? null;
}

export async function POST() {
  const calls = await db.call.findMany({
    where: {
      managerId: null,
      meta: {
        not: Prisma.JsonNull,
      },
    },
    take: 500,
  });

  let updated = 0;

  for (const call of calls) {
    const meta = (call.meta ?? {}) as Record<string, unknown>;

    const amoUserId =
      (meta as any).amoUserId ??
      (meta as any).userId ??
      (meta as any).raw?.responsible_user_id ??
      (meta as any).raw?.user_id ??
      null;

    if (!amoUserId) continue;

    const managerId = await resolveManagerIdForAmoUser(
      call.companyId,
      amoUserId
    );

    if (!managerId) continue;

    await db.call.update({
      where: { id: call.id },
      data: { managerId },
    });

    updated++;
  }

  return NextResponse.json({
    ok: true,
    processed: calls.length,
    updated,
  });
}
