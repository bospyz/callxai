import { db } from "@/lib/db";
import {
  CallStatus,
  IntegrationType,
  SubscriptionStatus,
} from "@prisma/client";

export type AmoIntegrationConfig = {
  domain: string;           // xxx.amocrm.ru
  apiDomain?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  clientId?: string | null;
  clientSecret?: string | null;
  redirectUri?: string | null;
  lastSyncAt?: string | null;
  tokenExpiresAt?: string | null;
};

type AmoIntegrationWithConfig = {
  id: string;
  companyId: string;
  config: AmoIntegrationConfig;
};

export async function hasActivePaidSubscription(
  companyId: string
): Promise<boolean> {
  const sub = await db.subscription.findFirst({
    where: {
      companyId,
      status: SubscriptionStatus.ACTIVE,
    },
  });

  return !!sub;
}

async function getAmoIntegration(
  companyId: string
): Promise<AmoIntegrationWithConfig | null> {
  const integration = await db.integration.findFirst({
    where: {
      companyId,
      type: IntegrationType.AMOCRM,
      enabled: true,
    },
  });

  if (!integration || !integration.config) return null;

  const config = integration.config as AmoIntegrationConfig;

  if (!config.domain || !config.accessToken) return null;

  return {
    id: integration.id,
    companyId,
    config,
  };
}

async function amoFetch(
  config: AmoIntegrationConfig,
  path: string
): Promise<any> {
  const baseDomain = config.apiDomain || config.domain;
  const url = `https://${baseDomain}${path}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (res.status === 401) {
    // TODO: здесь можно реализовать refreshToken-логику
    throw new Error("amoCRM access token expired or invalid");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`amoFetch error: ${res.status} ${text}`);
  }

  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchRecentCallsFromAmo(
  config: AmoIntegrationConfig,
  limit: number
): Promise<
  {
    externalId: string;
    audioUrl: string | null;
    duration: number | null;
    managerName: string | null;
    phone: string | null;
    raw: any;
  }[]
> {
  // Упрощённый пример: тянем notes типа звонков
  const result = await amoFetch(
    config,
    `/api/v4/leads/notes?note_type=10&limit=${limit}`
  );

  if (!result || !Array.isArray(result._embedded?.notes)) {
    return [];
  }

  return result._embedded.notes.map((note: any) => {
    const externalId = String(note.id);
    const audioUrl =
      note.params?.file || note.params?.link || note.params?.url || null;
    const duration = note.params?.duration ?? null;
    const managerName = note.responsible_user_id
      ? `user_${note.responsible_user_id}`
      : null;
    const phone = note.params?.phone ?? null;

    return {
      externalId,
      audioUrl,
      duration: typeof duration === "number" ? duration : null,
      managerName,
      phone,
      raw: note,
    };
  });
}

export async function syncAmoRecentCalls(opts: {
  companyId: string;
  limit?: number;
}): Promise<{ ok: boolean; created: number; message: string }> {
  const { companyId, limit = 50 } = opts;

  const amo = await getAmoIntegration(companyId);
  if (!amo) {
    throw new Error("amoCRM integration not found or not configured");
  }

  const { config } = amo;

  const items = await fetchRecentCallsFromAmo(config, limit);

  let created = 0;

  for (const item of items) {
    if (!item.externalId) continue;

    const existing = await db.call.findFirst({
      where: {
        companyId,
        externalId: item.externalId,
      },
      select: { id: true },
    });

    if (existing) {
      continue;
    }

    await db.call.create({
      data: {
        companyId,
        externalId: item.externalId,
        audioUrl: item.audioUrl,
        duration: item.duration,
        status: CallStatus.NEW,
        meta: {
          source: "amocrm",
          raw: item.raw,
          phone: item.phone,
          managerName: item.managerName,
        },
      },
    });

    created += 1;
  }

  try {
    const newConfig: AmoIntegrationConfig = {
      ...config,
      lastSyncAt: new Date().toISOString(),
    };

    await db.integration.update({
      where: { id: amo.id },
      data: { config: newConfig },
    });
  } catch (err) {
    console.error("Failed to update amo integration config", err);
  }

  return {
    ok: true,
    created,
    message: `Импортированы последние ${limit} звонков из amoCRM. Новых записей: ${created}.`,
  };
}
