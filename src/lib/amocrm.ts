// src/lib/amocrm.ts
import { db } from "@/lib/db";
import { IntegrationType } from "@prisma/client";

type AmoConfigRaw = any;

export type AmoIntegrationConfig = {
  domain: string; // "xxx.amocrm.ru" OR "xxx.amocrm.com"
  apiDomain?: string | null; // optional override
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt?: string | null; // ISO string
};

export type AmoRequestParams<T> = {
  companyId: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string; // "/api/v4/account"
  query?: Record<string, any>;
  body?: any;
  headers?: Record<string, string>;
  raw?: boolean;
};

function buildQuery(q?: Record<string, any>) {
  if (!q) return "";
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === "") continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

function pickString(v: any): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function normalizeDomain(input: string): string {
  const s = input.trim();
  if (s.startsWith("http://") || s.startsWith("https://")) {
    const u = new URL(s);
    return u.host;
  }
  return s.replace(/^\/+/, "").replace(/\/+$/, "");
}

export async function getAmoIntegrationConfig(companyId: string): Promise<AmoIntegrationConfig> {
  const integration = await db.integration.findFirst({
    where: { companyId, type: IntegrationType.AMOCRM, enabled: true },
    select: { id: true, config: true },
  });

  if (!integration) throw new Error("amo_integration_not_found");

  const cfg: AmoConfigRaw = integration.config ?? {};

  const domainRaw = pickString(cfg?.domain);
  if (!domainRaw) throw new Error("amo_integration_domain_missing");

  const domain = normalizeDomain(domainRaw);

  const accessToken = pickString(cfg?.accessToken) || pickString(cfg?.tokens?.accessToken);
  if (!accessToken) throw new Error("amo_integration_accessToken_missing");

  const refreshToken = pickString(cfg?.refreshToken) || pickString(cfg?.tokens?.refreshToken);

  const tokenExpiresAt =
    pickString(cfg?.tokenExpiresAt) ||
    (typeof cfg?.tokens?.expiresAtMs === "number"
      ? new Date(cfg.tokens.expiresAtMs).toISOString()
      : null);

  const apiDomain = pickString(cfg?.apiDomain);

  return {
    domain,
    apiDomain: apiDomain ?? null,
    accessToken,
    refreshToken,
    tokenExpiresAt,
  };
}

/**
 * Used by call-analysis.ts
 * Returns accessToken for best-effort Bearer download
 */
export async function amoGetAccessTokenForCompany(companyId: string): Promise<{ accessToken: string }> {
  const cfg = await getAmoIntegrationConfig(companyId);
  return { accessToken: cfg.accessToken };
}

/**
 * Core fetch wrapper
 * IMPORTANT: If amo returns non-2xx — we throw Error with (error as any).status
 * so sync auto-fallback can detect 405 and switch mode.
 */
export async function amoRequest<T = any>(params: AmoRequestParams<T>): Promise<T> {
  const cfg = await getAmoIntegrationConfig(params.companyId);

  const apiDomain = cfg.apiDomain || cfg.domain;
  const url = `https://${apiDomain}${params.path}${buildQuery(params.query)}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.accessToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(params.headers || {}),
  };

  const res = await fetch(url, {
    method: params.method,
    headers,
    body: params.body !== undefined ? JSON.stringify(params.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`amoRequest failed ${res.status}: ${text.slice(0, 2000)}`);
    (err as any).status = res.status;
    (err as any).details = { status: res.status, url };
    throw err;
  }

  if (params.raw) return (res as any) as T;

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) {
    return null as any;
  }

  return (await res.json()) as T;
}

/**
 * List call notes within time window.
 * Used by src/lib/amocrm-sync.ts
 */
export async function amoListCallNotes(params: {
  companyId: string;
  from: Date;
  to: Date;
  page: number;
  limit: number;
}) {
  const fromTs = Math.floor(params.from.getTime() / 1000);
  const toTs = Math.floor(params.to.getTime() / 1000);

  return await amoRequest<any>({
    companyId: params.companyId,
    method: "GET",
    path: "/api/v4/leads/notes",
    query: {
      limit: params.limit,
      page: params.page,
      "filter[updated_at][from]": fromTs,
      "filter[updated_at][to]": toTs,
    },
  });
}


 export async function amoListCallNotes(params: {
  companyId: string;
  from: Date;
  to: Date;
  page: number;
  limit: number;
}) {
  const fromTs = Math.floor(params.from.getTime() / 1000);
  const toTs = Math.floor(params.to.getTime() / 1000);

  const res = await amoRequest<any>({
    companyId: params.companyId,
    method: "GET",
    path: "/api/v4/leads/notes",
    query: {
      limit: params.limit,
      page: params.page,
      "filter[updated_at][from]": fromTs,
      "filter[updated_at][to]": toTs,
    },
  });

  // Логи — только тут, где res реально существует
  console.log("[AMO notes raw keys]", Object.keys(res || {}));
  console.log("[AMO notes embedded keys]", Object.keys(res?._embedded || {}));
  console.log(
    "[AMO notes sample]",
    JSON.stringify(res?._embedded || res, null, 2).slice(0, 2000)
  );

  return res;
}


/* ============================================================
   normalizeAmoCall — converts calls endpoint items OR notes into unified dto
============================================================ */

function toNumber(v: any): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDateFromUnixSeconds(v: any): Date | null {
  const n = toNumber(v);
  if (n == null) return null;
  const ms = n > 10_000_000_000 ? n : n * 1000;
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d : null;
}

function pickAudioUrl(raw: any): string | null {
  const p = raw?.params ?? {};
  return (
    (typeof p?.link === "string" && p.link) ||
    (typeof p?.url === "string" && p.url) ||
    (typeof p?.file === "string" && p.file) ||
    (typeof p?.record_url === "string" && p.record_url) ||
    (typeof p?.call?.link === "string" && p.call.link) ||
    (typeof p?.call?.record_url === "string" && p.call.record_url) ||
    null
  );
}

export type NormalizedAmoCallDto = {
  externalId: string;
  occurredAt: Date | null;

  durationSec: number | null;
  audioUrl: string | null;

  direction?: string | null;
  phone?: string | null;
  linePhone?: string | null;

  leadId?: number | null;
  leadName?: string | null;
  leadUrl?: string | null;

  pipelineId?: number | null;
  pipelineName?: string | null;

  stageId?: number | null;
  stageName?: string | null;

  amountKzt?: number | null;

  raw: any;
};

export function normalizeAmoCall(input: any): NormalizedAmoCallDto | null {
  if (!input || typeof input !== "object") return null;

  const externalId =
    typeof input?.id === "number" || typeof input?.id === "string"
      ? String(input.id)
      : typeof input?.uuid === "string"
        ? input.uuid
        : typeof input?.call_id === "string"
          ? input.call_id
          : typeof input?.unique_id === "string"
            ? input.unique_id
            : "";

  if (!externalId) return null;

  const occurredAt =
    toDateFromUnixSeconds(input?.occurred_at) ||
    toDateFromUnixSeconds(input?.created_at) ||
    (typeof input?.date === "string" ? new Date(input.date) : null);

  const durationSec =
    toNumber(input?.duration) ??
    toNumber(input?.duration_sec) ??
    toNumber(input?.params?.duration) ??
    toNumber(input?.params?.call?.duration) ??
    null;

  const audioUrl =
    pickAudioUrl(input) ||
    (typeof input?.recording_url === "string" ? input.recording_url : null) ||
    (typeof input?.record_url === "string" ? input.record_url : null) ||
    null;

  const phone =
    (typeof input?.phone === "string" && input.phone) ||
    (typeof input?.params?.phone === "string" && input.params.phone) ||
    (typeof input?.params?.call?.phone === "string" && input.params.call.phone) ||
    null;

  const direction =
    (typeof input?.direction === "string" ? input.direction : null) ||
    (typeof input?.params?.direction === "string" ? input.params.direction : null) ||
    null;

  const leadId =
    toNumber(input?.entity_id) ??
    toNumber(input?.lead_id) ??
    toNumber(input?.params?.entity_id) ??
    toNumber(input?.params?.lead_id) ??
    null;

  return {
    externalId,
    occurredAt: occurredAt && Number.isFinite(occurredAt.getTime()) ? occurredAt : null,
    durationSec,
    audioUrl,
    direction,
    phone,
    leadId,
    raw: input,
  };
}

/* ============================================================
   normalizeAmoEventCall — converts /api/v4/events items into unified dto
============================================================ */

function deepFindValue(
  obj: any,
  predicate: (key: string, value: any) => boolean,
  maxDepth = 5,
  _depth = 0
): any | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  if (_depth > maxDepth) return undefined;

  if (Array.isArray(obj)) {
    for (const v of obj) {
      const r = deepFindValue(v, predicate, maxDepth, _depth + 1);
      if (r !== undefined) return r;
    }
    return undefined;
  }

  for (const [k, v] of Object.entries(obj)) {
    try {
      if (predicate(k, v)) return v;
      const r = deepFindValue(v, predicate, maxDepth, _depth + 1);
      if (r !== undefined) return r;
    } catch {
      // ignore traversal errors
    }
  }
  return undefined;
}

function pickFirstString(raw: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = raw?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function safeUnixToDate(v: any): Date | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  const ms = n > 10_000_000_000 ? n : n * 1000;
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d : null;
}

export type NormalizedAmoEventCallDto = {
  externalId: string;
  occurredAt: Date | null;

  durationSec?: number | null;
  direction?: "inbound" | "outbound" | "unknown" | null;

  phone?: string | null;
  linePhone?: string | null;
  audioUrl?: string | null;

  amoUserId?: number | null;

  leadId?: string | number | null;
  leadName?: string | null;
  leadUrl?: string | null;

  raw: any;
};

export function normalizeAmoEventCall(event: any): NormalizedAmoEventCallDto | null {
  if (!event || typeof event !== "object") return null;

  const externalId =
    typeof event?.id === "number" || typeof event?.id === "string"
      ? String(event.id)
      : typeof event?.uuid === "string"
        ? event.uuid
        : "";

  if (!externalId) return null;

  const occurredAt =
    safeUnixToDate(event?.created_at) ||
    safeUnixToDate(event?.occurred_at) ||
    safeUnixToDate(event?.updated_at) ||
    null;

  const eventType = Number(event?.event_type ?? event?.type ?? NaN);
  const direction: "outbound" | "unknown" | null =
    Number.isFinite(eventType) && eventType === 30 ? "outbound" : "unknown";

  const data = event?.value_after ?? event?.value_before ?? event?.data ?? event?.params ?? event?.entity_data ?? {};

  const audioUrl =
    pickFirstString(data, ["record_url", "recordUrl", "record", "recording_url", "audio_url", "url", "link"]) ||
    pickFirstString(event, ["record_url", "recordUrl", "record", "recording_url", "audio_url", "url", "link"]) ||
    ((deepFindValue(event, (k, v) => {
      const kk = String(k).toLowerCase();
      return (
        ["record_url", "recordurl", "recording_url", "recordingurl", "audio_url", "audiourl", "record", "link", "url"].includes(kk) &&
        typeof v === "string" &&
        v.trim()
      );
    }) as string | undefined)?.trim?.() ?? null);

  const durationRaw =
    data?.duration ?? data?.duration_sec ?? data?.call_duration ?? data?.call_duration_sec ??
    (deepFindValue(event, (k, v) => {
      const kk = String(k).toLowerCase();
      return (
        ["duration", "duration_sec", "call_duration", "call_duration_sec"].includes(kk) &&
        (typeof v === "number" || (typeof v === "string" && v.trim()))
      );
    }) as any);

  const durationNum =
    typeof durationRaw === "number" ? durationRaw :
    typeof durationRaw === "string" ? Number(durationRaw) :
    null;

  const phone =
    pickFirstString(data, ["phone", "caller", "callee", "client_phone", "from", "to", "number"]) ||
    pickFirstString(event, ["phone"]) ||
    ((deepFindValue(event, (k, v) => {
      const kk = String(k).toLowerCase();
      return (
        ["phone", "caller", "callee", "client_phone", "from", "to", "number"].includes(kk) &&
        typeof v === "string" &&
        v.trim()
      );
    }) as string | undefined)?.trim?.() ?? null);

  const linePhone =
    pickFirstString(data, ["line_phone", "linePhone", "sip", "pbx_number", "pbxnumber"]) ||
    ((deepFindValue(event, (k, v) => {
      const kk = String(k).toLowerCase();
      return (
        ["line_phone", "linephone", "sip", "pbx_number", "pbxnumber"].includes(kk) &&
        typeof v === "string" &&
        v.trim()
      );
    }) as string | undefined)?.trim?.() ?? null);

  const amoUserIdRaw =
    event?.created_by ??
    event?.created_by_id ??
    event?.created_by_user_id ??
    data?.created_by ??
    data?.created_by_id ??
    data?.user_id ??
    data?.responsible_user_id ??
    (deepFindValue(event, (k, v) => {
      const kk = String(k).toLowerCase();
      return (
        ["created_by", "created_by_id", "user_id", "manager_id", "responsible_user_id"].includes(kk) &&
        (typeof v === "number" || (typeof v === "string" && v.trim()))
      );
    }) as any);

  const amoUserId =
    typeof amoUserIdRaw === "number" ? amoUserIdRaw :
    typeof amoUserIdRaw === "string" && amoUserIdRaw.trim() ? Number(amoUserIdRaw) :
    null;

  const leadId =
    event?.entity_id ??
    data?.lead_id ??
    data?.entity_id ??
    (deepFindValue(event, (k, v) => {
      const kk = String(k).toLowerCase();
      return ["lead_id", "entity_id", "leadid"].includes(kk) && (typeof v === "number" || typeof v === "string");
    }) as any) ??
    null;

  return {
    externalId,
    occurredAt,
    durationSec: Number.isFinite(durationNum as any) ? Number(durationNum) : null,
    direction,
    phone,
    linePhone,
    audioUrl,
    amoUserId: Number.isFinite(amoUserId as any) ? amoUserId : null,
    leadId,
    leadName: null,
    leadUrl: null,
    raw: event,
  };
}
