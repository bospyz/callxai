import { db } from "@/lib/db";
import {
  CallStatus,
  IntegrationType,
  SubscriptionStatus,
} from "@prisma/client";

const AMO_STUB_MODE = process.env.AMO_STUB_MODE === "true";

export type AmoIntegrationConfig = {
  domain: string; // arenasunset2.amocrm.ru
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
    // можно добавить таймауты/agent при желании
  });

  if (res.status === 401) {
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

// ---------- STUB-МОД ДЛЯ MVP ----------

function buildStubItems(limit: number) {
  const items: {
    externalId: string;
    audioUrl: string | null;
    duration: number | null;
    managerName: string | null;
    phone: string | null;
    raw: any;
  }[] = [];

  const now = Date.now();

  for (let i = 0; i < limit; i++) {
    const idx = i + 1;
    items.push({
      externalId: `stub-${now}-${idx}`,
      audioUrl: null,
      duration: 60 + i * 10,
      managerName: `Stub Manager #${idx}`,
      phone: `+7775333${("000" + idx).slice(-3)}`,
      raw: {
        stub: true,
        index: idx,
        createdAt: new Date(now - i * 60_000).toISOString(),
      },
    });
  }

  return items;
}

// ---------- ПУБЛИЧНАЯ ФУНКЦИЯ СИНКА ----------

export async function syncAmoRecentCalls(opts: {
  companyId: string;
  limit?: number;
}): Promise<{ ok: boolean; created: number; message: string }> {
  const { companyId, limit = 50 } = opts;

  const amo = await getAmoIntegration(companyId);

  if (!amo) {
    if (!AMO_STUB_MODE) {
      throw new Error("amoCRM integration not found or not configured");
    }

    // Даже если нет интеграции — в режиме заглушки всё равно создаём тестовые звонки
    const stubItems = buildStubItems(limit);
    const created = await saveItemsAsCalls(companyId, stubItems, "amocrm-stub-no-integration");

    return {
      ok: true,
      created,
      message: `STUB: создано ${created} тестовых звонков без реальной amoCRM (интеграция не настроена).`,
    };
  }

  let items:
    | {
        externalId: string;
        audioUrl: string | null;
        duration: number | null;
        managerName: string | null;
        phone: string | null;
        raw: any;
      }[]
    | null = null;

  if (AMO_STUB_MODE) {
    // вообще не ходим в amo, сразу генерим заглушки
    items = buildStubItems(limit);
  } else {
    // реальный запрос в amo
    items = await fetchRecentCallsFromAmo(amo.config, limit);
  }

  let created = await saveItemsAsCalls(
    companyId,
    items,
    AMO_STUB_MODE ? "amocrm-stub" : "amocrm"
  );

  // обновляем lastSyncAt (для реальной интеграции)
  try {
    const newConfig: AmoIntegrationConfig = {
      ...amo.config,
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
    message: AMO_STUB_MODE
      ? `STUB: создано ${created} тестовых звонков (режим заглушки amoCRM).`
      : `Импортированы последние ${limit} звонков из amoCRM. Новых записей: ${created}.`,
  };
}

// Вспомогательная функция сохранения звонков в БД с дедупликацией по externalId
async function saveItemsAsCalls(
  companyId: string,
  items: {
    externalId: string;
    audioUrl: string | null;
    duration: number | null;
    managerName: string | null;
    phone: string | null;
    raw: any;
  }[],
  source: string
): Promise<number> {
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
          source,
          raw: item.raw,
          phone: item.phone,
          managerName: item.managerName,
        },
      },
    });

    created += 1;
  }

  return created;
}
