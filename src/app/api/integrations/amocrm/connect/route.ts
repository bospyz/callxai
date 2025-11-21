import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { IntegrationType } from "@prisma/client";

function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(payload, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const companyId = (session?.user as any)?.companyId as string | undefined;

  if (!companyId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const body = await req.json();
  const {
    domain,
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    redirectUri,
  } = body;

  if (!domain || !accessToken) {
    return new NextResponse("domain and accessToken are required", {
      status: 400,
    });
  }

  const payload = decodeJwtPayload(accessToken) || {};
  const expiresAt = payload.exp ? new Date(payload.exp * 1000) : null;

  const config = {
    domain,
    accessToken,
    refreshToken: refreshToken || null,
    clientId: clientId || null,
    clientSecret: clientSecret || null,
    redirectUri: redirectUri || null,
    apiDomain: null,
    lastSyncAt: null,
    tokenExpiresAt: expiresAt ? expiresAt.toISOString() : null,
  };

  const integration = await db.integration.upsert({
    where: {
      companyId_type: {
        companyId,
        type: IntegrationType.AMOCRM,
      },
    } as any,
    create: {
      companyId,
      type: IntegrationType.AMOCRM,
      enabled: true,
      config,
    },
    update: {
      enabled: true,
      config,
    },
  });

  return NextResponse.json({
    ok: true,
    message: "Интеграция amoCRM подключена",
    integrationId: integration.id,
  });
}
