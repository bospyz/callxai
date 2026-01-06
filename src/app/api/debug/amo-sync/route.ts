import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithCompany } from "@/lib/auth-guard";
import { syncAmoRecentCalls } from "@/lib/amocrm-sync";
import { db } from "@/lib/db";

async function run(companyId: string, body: any) {
  const res = await syncAmoRecentCalls({
    companyId,
    limit: body.limit ?? 50,
    days: body.days ?? 30,
    skipShort: body.skipShort ?? false,
    minDurationSec: body.minDurationSec ?? 0,
    perPage: body.perPage ?? 50,
    path: body.path,
  });

  const after = await db.call.count({ where: { companyId } });

  return { companyId, sync: res, dbCountAfter: after };
}

export async function POST(req: NextRequest) {
  const { companyId } = await requireAuthWithCompany();
  const body = await req.json().catch(() => ({}));
  return NextResponse.json(await run(companyId, body));
}

export async function GET() {
  const { companyId } = await requireAuthWithCompany();
  return NextResponse.json(await run(companyId, {}));
}
