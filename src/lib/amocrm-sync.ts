// src/lib/amocrm-sync.ts
import { db } from "@/lib/db";
import {
  CallDirection,
  CallStatus,
  CallTaskStatus,
  SubscriptionStatus,
} from "@prisma/client";

import { canCompanyIngestCall } from "@/lib/call-quota";
import { enqueueCallTask } from "@/lib/workers/task-queue";
import { resolveManagerIdForAmoUser } from "@/lib/manager-mapping";

import {
  amoRequest,
  amoListCallNotes,
  amoListCallEvents,
  normalizeAmoCall,
  normalizeAmoEventCall,
} from "@/lib/amocrm";

type StopReason =
  | "limit"
  | "scanMax"
  | "repeatPage"
  | "noItems"
  | "shortPage"
  | "filteredOld"
  | "error";

export type Mode = "auto" | "calls" | "events" | "notes";

const AMO_STUB_MODE = process.env.AMO_STUB_MODE === "true";

/* ============================================================
   Helpers
============================================================ */

function mapDirection(input?: string | null): CallDirection {
  const v = (input ?? "").toString().trim().toLowerCase();
  if (v === "inbound" || v === "in" || v === "incoming" || v === "1")
    return CallDirection.INBOUND;
  if (v === "outbound" || v === "out" || v === "outgoing" || v === "2")
    return CallDirection.OUTBOUND;
  return CallDirection.UNKNOWN;
}

function safeNumber(v: any): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildStubItems(limit: number) {
  const arr: any[] = [];
  const now = Date.now();
  for (let i = 0; i < limit; i++) {
    arr.push({
      id: `stub-${now}-${i}`,
      occurred_at: new Date(now - i * 60_000).toISOString(),
      duration: 60 + i * 10,
      direction: i % 2 === 0 ? "inbound" : "outbound",
      phone: `+7775${String(100000 + i)}`,
      record_url: null,
      raw: { stub: true, i },
    });
  }
  return arr;
}

function looksLike405(e: any): boolean {
  const msg = String(e?.message ?? "");
  return (
    msg.includes(" 405") ||
    msg.includes("405") ||
    msg.includes("Method Not Allowed")
  );
}

/* ============================================================
   MAIN: syncAmoRecentCalls
============================================================ */

export async function syncAmoRecentCalls(params: {
  companyId: string;

  mode?: Mode;

  limit?: number | null; // undefined/null => no limit
  days?: number;

  scanMax?: number;
  perPage?: number;

  embeddedKey?: string; // default "items"
  path?: string; // default process.env.AMO_CALLS_PATH or "/api/v4/calls"

  dateFromIso?: string;
  dateToIso?: string;

  overlapSec?: number; // default 10 min
  pageDelayMs?: number; // default 150ms

  minDurationSec?: number;
}): Promise<{
  ok: boolean;
  mode: Mode;

  dateFromIso: string;
  dateToIso: string;

  created: number;
  scanned: number;

  skippedExists: number;
  skippedNoExternalId: number;
  skippedNoAudio: number;

  normalizedNull: number;
  filteredByDate: number;
  filteredNoOccurredAt: number;

  durationMissing: number;

  stoppedBy?: StopReason;

  lastPage: number;
  lastItemsCount: number;

  message: string;
}> {
  const hasLimit =
    params.limit !== undefined &&
    params.limit !== null &&
    Number(params.limit) > 0;

  const target = hasLimit
    ? Math.max(1, Math.min(5000, Number(params.limit) || 50))
    : Number.POSITIVE_INFINITY;

  const days = Math.max(1, Math.min(90, Number(params.days ?? 7) || 7));
  const perPage = Math.max(
    10,
    Math.min(250, Number(params.perPage ?? 50) || 50)
  );
  const embeddedKey = params.embeddedKey ?? "items";

  const scanMax = Math.max(
    Number(params.scanMax ?? 0) || 0,
    hasLimit ? target * 50 : 50_000
  );

  const dateFromBase =
    safeDate(params.dateFromIso) ??
    new Date(Date.now() - days * 24 * 3600 * 1000);
  const dateTo = safeDate(params.dateToIso) ?? new Date();

  const overlapSec = Math.max(
    0,
    Math.min(3600, Number(params.overlapSec ?? 600) || 600)
  );
  const dateFrom = new Date(dateFromBase.getTime() - overlapSec * 1000);

  const pageDelayMs = Math.max(
    0,
    Math.min(2000, Number(params.pageDelayMs ?? 150) || 150)
  );
  const minDurationSec = Math.max(0, Number(params.minDurationSec ?? 0) || 0);

  let mode: Mode = params.mode ?? "auto";

  let created = 0;
  let scanned = 0;

  let skippedExists = 0;
  let skippedNoExternalId = 0;
  let skippedNoAudio = 0;

  let normalizedNull = 0;
  let filteredByDate = 0;
  let filteredNoOccurredAt = 0;

  let durationMissing = 0;

  let lastPage = 0;
  let lastItemsCount = 0;

  let stoppedBy: StopReason | undefined;
  const seenPageFingerprints = new Set<string>();

  function pageFingerprint(items: any[]): string {
    const ids = items
      .map((x) =>
        String(x?.id ?? x?.uuid ?? x?.call_id ?? x?.unique_id ?? "")
      )
      .filter(Boolean);
    return ids.slice(0, 25).join("|");
  }

  function extractItems(raw: any): any[] {
    const items: any[] =
      (Array.isArray(raw) ? raw : null) ??
      raw?._embedded?.[embeddedKey] ??
      raw?._embedded?.items ??
      raw?._embedded?.events ?? // IMPORTANT
      raw?._embedded?.calls ??
      raw?._embedded?.notes ??
      raw?.items ??
      raw?.events ??
      [];
    return Array.isArray(items) ? items : [];
  }

  async function fetchPageCalls(page: number) {
    const path = params.path || process.env.AMO_CALLS_PATH || "/api/v4/calls";
    return await amoRequest<any>({
      companyId: params.companyId,
      method: "GET",
      path,
      query: {
        page,
        limit: perPage,
        since: dateFrom.toISOString(),
      },
    });
  }

  async function fetchPageNotes(page: number) {
    return await amoListCallNotes({
      companyId: params.companyId,
      from: dateFrom,
      to: dateTo,
      page,
      limit: perPage,
    });
  }

  async function fetchPageEvents(page: number) {
    return await amoListCallEvents({
      companyId: params.companyId,
      from: dateFrom,
      to: dateTo,
      page,
      limit: perPage,
    });
  }

  async function tryFetch(page: number): Promise<{ items: any[]; used: Mode }> {
    if (AMO_STUB_MODE) {
      return { items: buildStubItems(perPage), used: "calls" };
    }

    if (mode === "notes") {
      const raw = await fetchPageNotes(page);
      return { items: extractItems(raw), used: "notes" };
    }

    if (mode === "events") {
      const { raw, items } = await fetchPageEvents(page);
      // на случай если extractItems ждёт _embedded.events
      const proxyRaw = raw ?? { _embedded: { events: items } };
      return { items: extractItems(proxyRaw), used: "events" };
    }

    if (mode === "calls") {
      const raw = await fetchPageCalls(page);
      return { items: extractItems(raw), used: "calls" };
    }

    // auto:
    // 1) try calls
    // 2) if calls 405 OR page=1 empty => try events
    // 3) fallback to notes
    try {
      const rawCalls = await fetchPageCalls(page);
      const callItems = extractItems(rawCalls);

      if (callItems.length > 0) return { items: callItems, used: "calls" };

      if (page === 1) {
        try {
          const { raw, items } = await fetchPageEvents(page);
          const eventItems = items?.length
            ? items
            : extractItems(raw ?? {});
          if (eventItems.length > 0) return { items: eventItems, used: "events" };
        } catch {
          // ignore and fallback
        }
      }

      return { items: callItems, used: "calls" };
    } catch (e: any) {
      if (looksLike405(e)) {
        try {
          const { raw, items } = await fetchPageEvents(page);
          const eventItems = items?.length
            ? items
            : extractItems(raw ?? {});
          if (eventItems.length > 0) return { items: eventItems, used: "events" };
        } catch {
          // ignore and fallback
        }

        const rawNotes = await fetchPageNotes(page);
        return { items: extractItems(rawNotes), used: "notes" };
      }
      throw e;
    }
  }

  for (let page = 1; ; page++) {
    if (created >= target) {
      stoppedBy = "limit";
      break;
    }
    if (scanned >= scanMax) {
      stoppedBy = "scanMax";
      break;
    }

    if (pageDelayMs > 0) await sleep(pageDelayMs);

    let items: any[] = [];
    let usedMode: Mode = mode;

    try {
      const res = await tryFetch(page);
      items = res.items;
      usedMode = res.used;
      if (mode === "auto") mode = res.used;
    } catch (e: any) {
      stoppedBy = "error";
      return {
        ok: false,
        mode: mode ?? "auto",
        dateFromIso: dateFromBase.toISOString(),
        dateToIso: dateTo.toISOString(),
        created,
        scanned,
        skippedExists,
        skippedNoExternalId,
        skippedNoAudio,
        normalizedNull,
        filteredByDate,
        filteredNoOccurredAt,
        durationMissing,
        stoppedBy,
        lastPage,
        lastItemsCount,
        message: `Sync failed: ${e?.message ?? String(e)}`,
      };
    }

    lastPage = page;
    lastItemsCount = items.length;

    if (!items.length) {
      stoppedBy = "noItems";
      break;
    }

    const fp = pageFingerprint(items);
    if (fp) {
      if (seenPageFingerprints.has(fp)) {
        stoppedBy = "repeatPage";
        break;
      }
      seenPageFingerprints.add(fp);
    }

    const pageDtos: Array<{ externalId: string; dto: any }> = [];
    let notesOldCount = 0;
    let notesInWindowCount = 0;

    for (const it of items) {
      if (created >= target) break;
      if (scanned >= scanMax) break;

      scanned += 1;

      const dto =
        usedMode === "events" ? normalizeAmoEventCall(it) : normalizeAmoCall(it);

      if (!dto) {
        normalizedNull += 1;
        continue;
      }

      const externalId = dto.externalId ? String(dto.externalId).trim() : "";
      if (!externalId) {
        skippedNoExternalId += 1;
        continue;
      }

      const occurredAt: Date | null = dto.occurredAt ?? null;
      if (!occurredAt) {
        filteredNoOccurredAt += 1;
        continue;
      }

      if (occurredAt < dateFromBase || occurredAt > dateTo) {
        filteredByDate += 1;
        if (mode === "notes" && occurredAt < dateFromBase) notesOldCount += 1;
        continue;
      }

      if (mode === "notes") notesInWindowCount += 1;

      const d = safeNumber(dto.durationSec);
      if (minDurationSec > 0 && d !== null && d < minDurationSec) continue;

      pageDtos.push({ externalId, dto });
    }

    if (mode === "notes") {
      const denom = Math.max(1, notesOldCount + notesInWindowCount);
      const oldShare = notesOldCount / denom;

      if (notesInWindowCount === 0 && notesOldCount > 0) {
        stoppedBy = "filteredOld";
      } else if (oldShare >= 0.7 && notesOldCount >= 10) {
        stoppedBy = "filteredOld";
      }
    }

    if (!pageDtos.length) {
      if (stoppedBy === "filteredOld") break;

      if (items.length < perPage) {
        stoppedBy = "shortPage";
        break;
      }
      continue;
    }

    const externalIds = Array.from(new Set(pageDtos.map((x) => x.externalId)));
    const existing = await db.call.findMany({
      where: { companyId: params.companyId, externalId: { in: externalIds } },
      select: { externalId: true },
    });
    const existingSet = new Set(existing.map((x) => x.externalId));

    for (const { externalId, dto } of pageDtos) {
      if (created >= target) {
        stoppedBy = "limit";
        break;
      }
      if (scanned >= scanMax) {
        stoppedBy = "scanMax";
        break;
      }

      if (existingSet.has(externalId)) {
        skippedExists += 1;
        continue;
      }

      const quota = await canCompanyIngestCall(params.companyId);
      if (!quota.allowed) {
        return {
          ok: false,
          mode,
          dateFromIso: dateFromBase.toISOString(),
          dateToIso: dateTo.toISOString(),
          created,
          scanned,
          skippedExists,
          skippedNoExternalId,
          skippedNoAudio,
          normalizedNull,
          filteredByDate,
          filteredNoOccurredAt,
          durationMissing,
          stoppedBy: "limit",
          lastPage,
          lastItemsCount,
          message: `quota_exceeded_${quota.plan}`,
        };
      }

      const occurredAt: Date | null = dto.occurredAt ?? null;
      if (!occurredAt) {
        filteredNoOccurredAt += 1;
        continue;
      }

      const durationN = safeNumber(dto.durationSec);
      if (durationN === null) durationMissing += 1;

      const audioUrlExternal = dto.audioUrl ? String(dto.audioUrl).trim() : "";
      const hasAudio = Boolean(audioUrlExternal);
      if (!hasAudio) skippedNoAudio += 1;

      const managerId =
        dto.amoUserId != null
          ? await resolveManagerIdForAmoUser(params.companyId, Number(dto.amoUserId))
          : null;

      await db.$transaction(async (tx) => {
        const call = await tx.call.create({
          data: {
            companyId: params.companyId,
            managerId,
            externalId,

            occurredAt,
            duration: durationN,

            direction: mapDirection(dto.direction),
            clientPhone: dto.phone ?? null,
            linePhone: dto.linePhone ?? null,

            audioUrlExternal: hasAudio ? audioUrlExternal : null,
            audioUrl: null,

            leadId: dto.leadId ?? null,
            leadName: dto.leadName ?? null,
            leadUrl: dto.leadUrl ?? null,

            pipelineId: dto.pipelineId ?? null,
            pipelineName: dto.pipelineName ?? null,

            stageId: dto.stageId ?? null,
            stageName: dto.stageName ?? null,

            amountKzt: dto.amountKzt ?? null,

            status: CallStatus.NEW,
            meta: dto.raw ?? {},
          } as any,
          select: { id: true },
        });

        if (hasAudio) {
          await tx.callTask.upsert({
            where: { callId: call.id },
            create: {
              callId: call.id,
              status: CallTaskStatus.NEW,
              error: null,
              attempts: 0,
            },
            update: {
              status: CallTaskStatus.NEW,
              error: null,
              lockedAt: null,
              nextRunAt: null,
            },
          });

          await enqueueCallTask(call.id);
        }
      });

      created += 1;
      existingSet.add(externalId);
    }

    if (stoppedBy === "filteredOld") break;

    if (items.length < perPage) {
      stoppedBy = "shortPage";
      break;
    }
  }

  const msgTarget = Number.isFinite(target)
    ? `${created}/${target}`
    : `${created} (no limit)`;

  const message =
    `Synced ${msgTarget} calls ` +
    `(mode=${mode}, scanned=${scanned}, normalizedNull=${normalizedNull}, ` +
    `filteredNoOccurredAt=${filteredNoOccurredAt}, filteredByDate=${filteredByDate}, ` +
    `skippedExists=${skippedExists}, skippedNoExternalId=${skippedNoExternalId}, ` +
    `skippedNoAudio=${skippedNoAudio}, durationMissing=${durationMissing}, ` +
    `stoppedBy=${stoppedBy ?? "?"}, lastPage=${lastPage}, lastItemsCount=${lastItemsCount})`;

  return {
    ok: true,
    mode,
    dateFromIso: dateFromBase.toISOString(),
    dateToIso: dateTo.toISOString(),
    created,
    scanned,
    skippedExists,
    skippedNoExternalId,
    skippedNoAudio,
    normalizedNull,
    filteredByDate,
    filteredNoOccurredAt,
    durationMissing,
    stoppedBy,
    lastPage,
    lastItemsCount,
    message,
  };
}

/* ============================================================
   Optional: webhook handler (если используешь)
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
      : null;

  if (!occurredAt || !Number.isFinite(occurredAt.getTime())) {
    throw new Error("webhook_missing_occurredAt");
  }

  const amoUserId = payload.userId ?? null;

  const managerId =
    amoUserId != null ? await resolveManagerIdForAmoUser(companyId, amoUserId) : null;

  const call = await db.call.create({
    data: {
      companyId,
      managerId,
      externalId: payload.callExternalId,

      occurredAt,
      duration: payload.durationSec,

      direction: mapDirection(payload.direction ?? null),
      clientPhone: payload.phone ?? null,

      audioUrlExternal: payload.audioUrl,
      audioUrl: null,

      leadId: payload.leadId ?? null,

      status: CallStatus.NEW,
      meta: {
        source: "amocrm-webhook",
        raw: payload.raw ?? null,
        contactId: payload.contactId ?? null,
        userId: amoUserId,
        userName: payload.userName ?? null,
      },
    } as any,
  });

  if (payload.audioUrl) {
    await enqueueCallTask(call.id);
  }

  return call.id;
}

/* ============================================================
   Push-back placeholder (если у тебя отдельно — можно удалить)
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
  if (!score) return;

  const subscription = await db.subscription.findFirst({
    where: { companyId: call.companyId, status: SubscriptionStatus.ACTIVE },
  });
  if (!subscription) return;

  const _note = buildAmoNote(call, score);
  void _note;
}

export async function refreshAllAmoTokens() {
  return;
}
