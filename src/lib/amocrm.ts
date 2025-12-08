import { db } from "@/lib/db";
import {
  CallStatus,
  IntegrationType,
  SubscriptionStatus,
} from "@prisma/client";


const AMO_STUB_MODE = process.env.AMO_STUB_MODE === "true";

export type AmoIntegrationConfig = {
  domain: string; // amoCRM domain
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

// ---------- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ WORKFLOW ----------

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

  if (!integration) return null;

  const config = integration.config as any;

  return {
    id: integration.id,
    companyId: integration.companyId,
    config: {
      domain: config.domain,
      apiDomain: config.apiDomain ?? null,
      accessToken: config.accessToken,
      refreshToken: config.refreshToken ?? null,
      clientId: config.clientId ?? null,
      clientSecret: config.clientSecret ?? null,
      redirectUri: config.redirectUri ?? null,
      lastSyncAt: config.lastSyncAt ?? null,
      tokenExpiresAt: config.tokenExpiresAt ?? null,
    },
  };
}

async function amoFetch(
  config: AmoIntegrationConfig,
  path: string,
  init?: RequestInit
) {
  const apiDomain = config.apiDomain || `${config.domain}`;
  const url = `https://${apiDomain}${path}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`amoFetch failed ${res.status}: ${text}`);
  }

  return res.json();
}

// ---------- ОБЩИЙ ТИП ДЛЯ ИМПОРТИРУЕМЫХ ЗВОНКОВ ----------

type ImportedCallItem = {
  externalId: string;
  audioUrl: string | null;
  duration: number | null;
  managerName: string | null;
  phone: string | null;
  raw: any;
  occurredAt: Date | null;
};

// ---------- ПОЛУЧЕНИЕ FRESH NOTES (CALLS) ИЗ AMO ----------

async function fetchRecentCallsFromAmo(
  config: AmoIntegrationConfig,
  limit: number
): Promise<ImportedCallItem[]> {
  const result = await amoFetch(
    config,
    `/api/v4/leads/notes?note_type=10&limit=${limit}`
  );

  if (!result || !Array.isArray(result._embedded?.notes)) {
    return [];
  }

  return result._embedded.notes.map((note: any): ImportedCallItem => {
    const externalId = String(note.id);
    const audioUrl =
      note.params?.file || note.params?.link || note.params?.url || null;
    const duration = note.params?.duration ?? null;
    const managerName = note.responsible_user_id
      ? `user_${note.responsible_user_id}`
      : null;
    const phone = note.params?.phone ?? null;
    const occurredAt =
      typeof note.created_at === "number"
        ? new Date(note.created_at * 1000)
        : null;

    return {
      externalId,
      audioUrl,
      duration: typeof duration === "number" ? duration : null,
      managerName,
      phone,
      raw: note,
      occurredAt,
    };
  });
}

// ---------- STUB-МОД ДЛЯ LOCAL / DEMO ----------

function buildStubItems(limit: number): ImportedCallItem[] {
  const items: ImportedCallItem[] = [];
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
      occurredAt: new Date(now - i * 60_000),
    });
  }

  return items;
}

// ---------- ПУБЛИЧНАЯ ФУНКЦИЯ СИНКА ----------

export async function syncAmoRecentCalls(opts: {
  companyId: string;
  limit?: number;
}): Promise<{
  ok: boolean;
  created: number;
  message?: string;
}> {
  const { companyId, limit = 100 } = opts;

  const amo = await getAmoIntegration(companyId);

  if (!amo) {
    return {
      ok: false,
      created: 0,
      message: "Интеграция AmoCRM не найдена",
    };
  }

  let items: ImportedCallItem[] | null = null;

  if (AMO_STUB_MODE) {
    items = buildStubItems(limit);
  } else {
    items = await fetchRecentCallsFromAmo(amo.config, limit);
  }

  if (!items || items.length === 0) {
    return {
      ok: true,
      created: 0,
      message: "Нет новых звонков в AmoCRM",
    };
  }

  const created = await saveImportedCalls({
    companyId,
    items,
    source: AMO_STUB_MODE ? "amocrm-stub" : "amocrm",
  });

  try {
    const newConfig: AmoIntegrationConfig = {
      ...amo.config,
      lastSyncAt: new Date().toISOString(),
    };

    await db.integration.update({
      where: { id: amo.id },
      data: { config: newConfig as any },
    });
  } catch (err) {
    console.error("Failed to update amo integration config", err);
  }

  return {
    ok: true,
    created,
    message: `Импортировано ${created} звонков из AmoCRM`,
  };
}

// ---------- СОХРАНЕНИЕ ИМПОРТИРОВАННЫХ ЗВОНКОВ ----------

type SaveImportedCallsOpts = {
  companyId: string;
  items: ImportedCallItem[];
  source: string;
};

async function saveImportedCalls(opts: SaveImportedCallsOpts): Promise<number> {
  const { companyId, items, source } = opts;

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

    if (existing) continue;

    const call = await db.call.create({
      data: {
        companyId,
        externalId: item.externalId,
        audioUrl: item.audioUrl,
        duration: item.duration,
        occurredAt: item.occurredAt ?? null,
        status: CallStatus.NEW,
        meta: {
          source,
          raw: item.raw,
          phone: item.phone,
          managerName: item.managerName,
        },
      },
    });

 await db.callTask.create({
  data: {
    callId: call.id,
    status: "NEW",
  },
});


    created += 1;
  }

  return created;
}
// ---------- ОБНОВЛЕНИЕ AMO ТОКЕНОВ (STUB) ----------

/**
 * Заглушка для крон-скрипта.
 * В будущем сюда можно повесить рефреш всех AmoCRM токенов компании.
 */
export async function refreshAllAmoTokens(): Promise<void> {
  // На проде тут можно:
  // 1) найти все интеграции AmoCRM с истекающим токеном
  // 2) обновить access/refresh токены через OAuth
  // Пока просто заглушка, чтобы не ломать билд.
  return;
}
