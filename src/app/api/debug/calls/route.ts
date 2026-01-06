import { NextResponse } from "next/server";
import { requireAuthWithCompany } from "@/lib/auth-guard";
import { db } from "@/lib/db";

export async function GET() {
  const { companyId } = await requireAuthWithCompany();

  const total = await db.call.count({ where: { companyId } });
  const withOccurredAt = await db.call.count({
    where: { companyId, occurredAt: { not: null } },
  });

  const range = await db.call.aggregate({
    where: { companyId, occurredAt: { not: null } },
    _min: { occurredAt: true },
    _max: { occurredAt: true },
  });

  const sample = await db.call.findMany({
    where: { companyId },
    select: { id: true, externalId: true, occurredAt: true, duration: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return NextResponse.json({
    companyId,
    total,
    withOccurredAt,
    minOccurredAt: range._min.occurredAt,
    maxOccurredAt: range._max.occurredAt,
    sample,
  });
}
