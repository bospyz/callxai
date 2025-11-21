"use server";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { IntegrationType } from "@prisma/client";
export async function GET() {
  const session = await auth();
  const companyId = (session?.user as any)?.companyId as string | undefined;

  if (!companyId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const integrations = await db.integration.findMany({
    where: { companyId },
  });

  return NextResponse.json(integrations);
}

export async function POST(req: Request) {
  const session = await auth();
  const companyId = (session?.user as any)?.companyId as string | undefined;

  if (!companyId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("Invalid JSON body", { status: 400 });
  }

  const typeRaw = body?.type as string | undefined;
  const enabled = Boolean(body?.enabled);
  const rawConfig = body?.config ?? {};

  if (!typeRaw) {
    return new NextResponse("Missing integration type", { status: 400 });
  }

  const validTypes = Object.values(IntegrationType) as string[];
  if (!validTypes.includes(typeRaw)) {
    return new NextResponse("Invalid integration type", { status: 400 });
  }
  const type = typeRaw as IntegrationType;

  const safeConfig = JSON.parse(JSON.stringify(rawConfig || {}));

  const existing = await db.integration.findFirst({
    where: { companyId, type },
  });

  const record = existing
    ? await db.integration.update({
        where: { id: existing.id },
        data: { enabled, config: safeConfig },
      })
    : await db.integration.create({
        data: { companyId, type, enabled, config: safeConfig },
      });

  return NextResponse.json(record);
}





