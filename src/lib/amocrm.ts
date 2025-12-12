import { db } from "@/lib/db";
import {
  CallStatus,
  IntegrationType,
  SubscriptionStatus,
} from "@prisma/client";

import { canCompanyIngestCall } from "@/lib/call-quota";
import { enqueueCallProcessing } from "@/lib/workers/queue";
import { resolveManagerIdForAmoUser } from "@/lib/manager-mapping";

const AMO_STUB_MODE = process.env.AMO_STUB_MODE === "true";

/* ============================================================
   1. CONFIG + FETCH HELPERS
   ============================================================ */

export type AmoIntegrationConfig = {
  domain: string;
  apiDomain?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  clientId?: string | null;
  clientSecret?: string | null;
  redirectUri?: string | null;
  lastSyncAt?: string | null;
  tokenExpiresAt?: string | null;
};

export type AmoIntegrationWithConfig = {
  id: string;
  companyId: string;
  config: AmoIntegrationConfig;
};

export async function getAmoIntegration(
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

  const cfg = integration.config as any;

  return {
    id: integration.id,
    companyId: integration.companyId,
    config: {
      domain: cfg.domain,
      apiDomain: cfg.apiDomain ?? null,
      accessToken: cfg.accessToken,
      refreshToken: cfg.refreshToken ?? null,
      clientId: cfg.clientId ?? null,
      clientSecret: cfg.clientSecret ?? null,
      redirectUri: cfg.redirectUri ?? null,
      lastSyncAt: cfg.lastSyncAt ?? null,
      tokenExpiresAt: cfg.tokenExpiresAt ?? null,
    },
  };
}

async function amoFetch(
  config: AmoIntegrationConfig,
  path: string,
  init?: RequestInit
) {
  const apiDomain = config.apiDomain || config.domain;
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

/* ============================================================
   2. CRON IMPORT  Fallback для Amo Notes типа 10
   ============================================================ */

export type ImportedCallItem = {
  externalId: string;
  audioUrl: string | null;
  duration: number | null;
  phone: string | null;
  managerName: string | null;
  amoUserId: number | null;
  occurredAt: Date | null;
  raw: any;
};

async function fetchRecentCallsFromAmo(
  config: AmoIntegrationConfig,
  limit: number
): Promise<ImportedCallItem[]> {
  const result = await amoFetch(
    config,
    `/api/v4/leads/notes?note_type=10&limit=${limit}`
  );

  if (!Array.isArray(result?._embedded?.notes)) return [];

  return result._embedded.notes.map((note: any) => {
    const duration = note.params?.duration;

    const amoUserIdRaw = note.responsible_user_id;
    const amoUserId =
      typeof amoUserIdRaw === "number"
        ? amoUserIdRaw
        : amoUserIdRaw != null
        ? Number(amoUserIdRaw)
        : null;

    return {
      externalId: String(note.id),
      audioUrl:
        note.params?.file || note.params?.link || note.params?.url || null,
      duration: typeof duration === "number" ? duration : null,
      phone: note.params?.phone ?? null,
      managerName: amoUserId != null ? `user_${amoUserId}` : null,
      amoUserId,
      occurredAt:
        typeof note.created_at === "number"
          ? new Date(note.created_at * 1000)
          : null,
      raw: note,
    };
  });
}

function buildStubItems(limit: number): ImportedCallItem[] {
  const arr: ImportedCallItem[] = [];
  const now = Date.now();
  for (let i = 0; i < limit; i++) {
    arr.push({
      externalId: `stub-${now}-${i}`,
      audioUrl: null,
      duration: 60 + i * 10,
      phone: `+7775${String(100000 + i)}`,
      managerName: `Stub Manager #${i}`,
      amoUserId: null,
      occurredAt: new Date(now - i * 60000),
      raw: { stub: true, i },
    });
  }
  return arr;
}

export async function syncAmoRecentCalls(opts: {
  companyId: string;
  limit?: number;
}) {
  const { companyId, limit = 50 } = opts;
  const amo = await getAmoIntegration(companyId);
  if (!amo) return { ok: false, created: 0, message: "integration_not_found" };

  let items: ImportedCallItem[] = [];

  if (AMO_STUB_MODE) items = buildStubItems(limit);
  else items = await fetchRecentCallsFromAmo(amo.config, limit);

  if (!items.length) {
    return { ok: true, created: 0, message: "no_calls_found" };
  }

  let created = 0;

  for (const item of items) {
    const exists = await db.call.findFirst({
      where: { companyId, externalId: item.externalId },
      select: { id: true },
    });

    if (exists) continue;

    // Пробуем привязать менеджера к звонку по amoUserId
    const managerId =
      item.amoUserId != null
        ? await resolveManagerIdForAmoUser(companyId, item.amoUserId)
        : null;

    const call = await db.call.create({
      data: {
        companyId,
        managerId,
        externalId: item.externalId,
        audioUrl: item.audioUrl,
        audioUrlExternal: item.audioUrl,
        duration: item.duration,
        occurredAt: item.occurredAt ?? new Date(),
        status: CallStatus.NEW,
        meta: {
          source: "amocrm-cron",
          raw: item.raw,
          phone: item.phone,
          managerName: item.managerName,
          amoUserId: item.amoUserId,
        },
      },
    });

    await enqueueCallProcessing({ callId: call.id });
    created++;
  }

  return { ok: true, created };
}

/* ============================================================
   3. WEBHOOK HANDLER (используется из API route)
   ============================================================ */

export type AmoCallWebhookPayload = {
  callExternalId: string;
  audioUrl: string | null;
  durationSec: number | null;
  phone?: string | null;
  direction?: string | null;
  leadId?: number | null;
  contactId?: number | null;
  userId?: number | null;
  userName?: string | null;
  startedAt?: string | number | null;
  raw?: any;
};

export async function handleAmoCallWebhook(opts: {
  companyId: string;
  payload: AmoCallWebhookPayload;
}) {
  const { companyId, payload } = opts;

  if (!payload.callExternalId) throw new Error("missing_callExternalId");

  const quota = await canCompanyIngestCall(companyId);
  if (!quota.allowed) throw new Error(`quota_exceeded_${quota.plan}`);

  const exists = await db.call.findFirst({
    where: { companyId, externalId: payload.callExternalId },
    select: { id: true },
  });

  if (exists) return exists.id;

  const occurredAt =
    payload.startedAt != null
      ? new Date(
          typeof payload.startedAt === "number"
            ? payload.startedAt * 1000
            : payload.startedAt
        )
      : new Date();

  const amoUserId = payload.userId ?? null;

  // Пробуем найти менеджера по amoUserId
  const managerId =
    amoUserId != null
      ? await resolveManagerIdForAmoUser(companyId, amoUserId)
      : null;

  const call = await db.call.create({
    data: {
      companyId,
      managerId,
      externalId: payload.callExternalId,
      audioUrl: payload.audioUrl,
      audioUrlExternal: payload.audioUrl,
      duration: payload.durationSec,
      occurredAt,
      status: CallStatus.NEW,
      meta: {
        source: "amocrm-webhook",
        raw: payload.raw ?? null,
        phone: payload.phone ?? null,
        direction: payload.direction ?? null,
        leadId: payload.leadId ?? null,
        contactId: payload.contactId ?? null,
        userId: amoUserId,
        userName: payload.userName ?? null,
      },
    },
  });

  await enqueueCallProcessing({ callId: call.id });

  return call.id;
}

/* ============================================================
   4. PUSH-BACK РЕЗУЛЬТАТОВ В AMOCRM
   ============================================================ */

function buildAmoNote(call: any, score: any) {
  const s = score?.totalScore ?? score?.score ?? "";

  return [
    `AI-анализ звонка (Score: ${s}/100)`,
    "",
    score?.summary ?? "",
    "",
    "Ошибки:",
    ...(score?.issues ?? []).map((i: any) => ` ${i}`),
    "",
    `Подробности звонка доступны в CALLXAI (ID ${call.id}).`,
  ].join("\n");
}

export async function pushCallResultToAmo(callId: string) {
  const call = await db.call.findUnique({
    where: { id: callId },
    include: { callScore: true },
  });

  if (!call) return;

  const score = call.callScore;
  if (!score) return; // анализ ещё не готов

  const companyId = call.companyId;

  const subscription = await db.subscription.findFirst({
    where: { companyId, status: SubscriptionStatus.ACTIVE },
  });

  if (!subscription) return; // отправка только для платных планов

  const amo = await getAmoIntegration(companyId);
  if (!amo) return;

  const meta = (call.meta || {}) as any;
  const leadId =
    meta.leadId ?? meta.raw?.lead_id ?? meta.raw?.entity_id ?? null;

  if (!leadId) return; // нет куда пушить

  if (AMO_STUB_MODE) {
    console.log("[AMO_STUB] pushCallResult", buildAmoNote(call, score));
    return;
  }

  // 1) Создать заметку
  const note = buildAmoNote(call, score);

  await amoFetch(amo.config, `/api/v4/leads/${leadId}/notes`, {
    method: "POST",
    body: JSON.stringify([
      {
        note_type: "common",
        params: { text: note },
      },
    ]),
  });

  // 2) Обновить кастомные поля сделки
  const aiScoreFieldId = process.env.AMO_FIELD_AI_SCORE_ID;
  const aiProblemFieldId = process.env.AMO_FIELD_AI_PROBLEM_FLAG_ID;

  const cf: any[] = [];

  if (aiScoreFieldId) {
    cf.push({
      field_id: Number(aiScoreFieldId),
      values: [{ value: score.totalScore }],
    });
  }

  if (aiProblemFieldId) {
    const hasProblem =
      Array.isArray(score.issues) && score.issues.length > 0 ? 1 : 0;
    cf.push({
      field_id: Number(aiProblemFieldId),
      values: [{ value: hasProblem }],
    });
  }

  if (cf.length > 0) {
    await amoFetch(amo.config, `/api/v4/leads/${leadId}`, {
      method: "PATCH",
      body: JSON.stringify({
        custom_fields_values: cf,
      }),
    });
  }

  // 3) Создать задачу менеджеру, если звонок плохой
  if (score.totalScore < 60) {
    const amoUserId =
      meta.userId ?? meta.raw?.responsible_user_id ?? null;

    if (amoUserId) {
      await amoFetch(amo.config, `/api/v4/tasks`, {
        method: "POST",
        body: JSON.stringify([
          {
            text:
              "Пересмотреть звонок  AI выявил проблемы (низкий Score).",
            complete_till: Math.floor(Date.now() / 1000) + 86400,
            entity_id: leadId,
            entity_type: "leads",
            responsible_user_id: amoUserId,
          },
        ]),
      });
    }
  }
}

/* ============================================================
   5. TOKENS REFRESH (stub)
   ============================================================ */

export async function refreshAllAmoTokens() {
  // TODO  реализовать OAuth refresh
  return;
}
