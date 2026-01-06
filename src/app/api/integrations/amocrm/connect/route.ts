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
  const domain = String(body?.domain ?? "").trim();
  const accessToken = String(body?.accessToken ?? "").trim();
  const refreshTokenRaw =
    body?.refreshToken != null ? String(body.refreshToken).trim() : "";

  if (!domain || !accessToken) {
    return new NextResponse("domain and accessToken are required", {
      status: 400,
    });
  }

  // exp (сек) -> expiresAtMs
  const payload = decodeJwtPayload(accessToken) || {};
  const expiresAtMs =
    typeof payload.exp === "number"
      ? payload.exp * 1000
      : Date.now() + 60 * 60 * 1000; // fallback 1h

  const config = {
    domain,
    accessToken,
    refreshToken: refreshTokenRaw.length > 0 ? refreshTokenRaw : null,
    tokenExpiresAt: new Date(expiresAtMs).toISOString(),
    connectedAt: new Date().toISOString(),
  };

  const integration = await db.integration.upsert({
    // если у тебя в Prisma есть @@unique([companyId, type]) с именем companyId_type
    where: {
      companyId_type: { companyId, type: IntegrationType.AMOCRM },
    } as any,
    create: {
      companyId,
      type: IntegrationType.AMOCRM,
      enabled: true,
      config: config as any,
    },
    update: {
      enabled: true,
      config: config as any,
    },
  });

  return NextResponse.json({
    ok: true,
    message: "Интеграция amoCRM подключена",
    integrationId: integration.id,
    // полезно вернуть, чтобы сразу визуально проверить формат
    config: {
      domain: config.domain,
      hasAccessToken: Boolean(config.accessToken),
      hasRefreshToken: Boolean(config.refreshToken),
      tokenExpiresAt: config.tokenExpiresAt,
      connectedAt: config.connectedAt,
    },
  });
}
