// src/lib/amocrm.ts
import { db } from "@/lib/db";
import crypto from "crypto";
import { IntegrationType } from "@prisma/client";

/* ============================================================
   TYPES
============================================================ */

export type AmoTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number; // unix ms
};

export type EncryptedTokens = {
  enc: true;
  v: 1;
  blob: string; // iv.cipher.tag (base64 parts)
  expiresAtMs: number;
};

export type AmoConfig = {
  domain: string; // example.amocrm.ru
  accountId?: string;
  tokens?: AmoTokens | EncryptedTokens;
  webhookSecret?: string;
  meta?: Record<string, any>;
};

export type AmoCallDTO = {
  externalId: string;

  occurredAt?: Date;
  durationSec?: number;

  direction?: "inbound" | "outbound" | "unknown";

  phone?: string; // clientPhone
  linePhone?: string; // linePhone

  believesAudioUrl?: string; // (optional debug field)
  audioUrl?: string; // recording url from amo (external)

  leadId?: string;
  leadName?: string;
  leadUrl?: string;

  pipelineId?: string;
  pipelineName?: string;

  stageId?: string;
  stageName?: string;

  amountKzt?: number;

  raw?: any; // MUST keep for debugging
};

type AmoHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type AmoError = {
  status: number;
  message: string;
  details?: any;
};

type AmoRequestOpts = {
  companyId: string;
  method: AmoHttpMethod;
  path: string; // "/api/v4/..."
  query?: Record<string, string | number | boolean | undefined>;
  body?: any;
  timeoutMs?: number;
  retryMax?: number;
  disableAutoRefresh?: boolean;
};

type AmoOAuthTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
};

/* ============================================================
   ENV / CONSTANTS
============================================================ */

const OAUTH_BASE = process.env.AMO_OAUTH_BASE || "https://www.amocrm.ru/oauth2";

const TIMEOUT_MS = (() => {
  const v = Number(process.env.AMO_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : 20_000;
})();

const RETRY_MAX = (() => {
  const v = Number(process.env.AMO_RETRY_MAX);
  return Number.isFinite(v) && v >= 0 ? v : 3;
})();

const TOKEN_EXPIRY_SKEW_MS = 60_000; // refresh 60s before expiry

/* ============================================================
   SMALL UTILS
============================================================ */

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function computeBackoffMs(attempt: number) {
  const base = 400 * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(8000, base + jitter);
}

async function fetchTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function asAmoError(e: any): AmoError {
  if (e && typeof e.status === "number" && typeof e.message === "string") return e as AmoError;
  const msg = e instanceof Error ? e.message : String(e ?? "Unknown error");
  return { status: 0, message: msg, details: e };
}

async function parseJsonOrThrow(res: Response) {
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const err: AmoError = {
      status: res.status,
      message: json?.detail || json?.error || json?.message || `amoCRM request failed (${res.status})`,
      details: json,
    };
    throw err;
  }

  return json;
}

function buildQuery(query?: Record<string, string | number | boolean | undefined>): string {
  if (!query) return "";
  const pairs = Object.entries(query).filter(([, v]) => v !== undefined);
  if (!pairs.length) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of pairs) sp.set(k, String(v));
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

/* ============================================================
   DOMAIN VALIDATION
============================================================ */

export function validateAmoDomain(domain: string): string {
  const d = domain.trim().toLowerCase();
  // allow common amo zones; extend if needed
  if (!/^[a-z0-9-]+\.amocrm\.(ru|com|kz|ua|by)$/i.test(d)) {
    throw new Error("Invalid amoCRM domain format");
  }
  return d;
}

/* ============================================================
   TOKEN ENCRYPTION (OPTIONAL)
============================================================ */

function getEncKey(): Buffer | null {
  const raw = process.env.AMO_TOKEN_ENC_KEY;
  if (!raw) return null;

  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");

  const buf = Buffer.from(raw, "base64");
  if (buf.length === 32) return buf;

  throw new Error("AMO_TOKEN_ENC_KEY invalid: expected 32 bytes base64 or 64 hex chars");
}

function encryptJson(obj: any): { blob: string } {
  const key = getEncKey();
  if (!key) throw new Error("Encryption key not configured");

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const plaintext = Buffer.from(JSON.stringify(obj), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    blob: `${iv.toString("base64")}.${ciphertext.toString("base64")}.${tag.toString("base64")}`,
  };
}

function decryptJson(blob: string): any {
  const key = getEncKey();
  if (!key) throw new Error("Encryption key not configured");

  const parts = blob.split(".");
  if (parts.length !== 3) throw new Error("Bad encrypted blob format");

  const iv = Buffer.from(parts[0], "base64");
  const ciphertext = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
}

function maybeEncryptTokens(tokens: AmoTokens): AmoTokens | EncryptedTokens {
  const key = getEncKey();
  if (!key) return tokens;

  const enc = encryptJson(tokens);
  return { enc: true, v: 1, blob: enc.blob, expiresAtMs: tokens.expiresAtMs };
}

function maybeDecryptTokens(tokens: AmoTokens | EncryptedTokens): AmoTokens {
  if ((tokens as EncryptedTokens)?.enc) {
    return decryptJson((tokens as EncryptedTokens).blob) as AmoTokens;
  }
  return tokens as AmoTokens;
}

/* ============================================================
   DB CONFIG
============================================================ */

async function getAmoIntegrationByCompany(companyId: string) {
  return db.integration.findFirst({
    where: { companyId, type: IntegrationType.AMOCRM },
    select: { id: true, enabled: true, config: true, companyId: true, updatedAt: true, createdAt: true },
  });
}

function readAmoConfig(raw: any): AmoConfig {
  if (!raw || typeof raw !== "object") throw new Error("amoCRM config missing or invalid");
  if (typeof raw.domain !== "string" || !raw.domain) throw new Error("amoCRM config.domain missing");
  return raw as AmoConfig;
}

async function writeAmoConfig(integrationId: string, cfg: AmoConfig) {
  await db.integration.update({ where: { id: integrationId }, data: { config: cfg } });
}

export async function requireAmoIntegrationEnabled(companyId: string) {
  const integration = await getAmoIntegrationByCompany(companyId);
  if (!integration) throw new Error("amoCRM integration not found");
  if (!integration.enabled) throw new Error("amoCRM integration is disabled");
  const cfg = readAmoConfig(integration.config);
  return { integration, cfg };
}

/* ============================================================
   OAUTH
============================================================ */

export function buildAmoAuthorizeUrl(params: { domain: string; state: string }): string {
  const domain = validateAmoDomain(params.domain);
  const clientId = requireEnv("AMO_CLIENT_ID");
  const redirectUri = requireEnv("AMO_REDIRECT_URI");

  const url = new URL(`https://${domain}/oauth`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("state", params.state);
  url.searchParams.set("redirect_uri", redirectUri);
  // url.searchParams.set("mode", "post_message"); // optional
  return url.toString();
}

export async function exchangeAmoCodeForTokens(params: {
  companyId: string;
  domain: string;
  code: string;
}): Promise<{ integrationId: string; config: AmoConfig }> {
  const domain = validateAmoDomain(params.domain);

  const clientId = requireEnv("AMO_CLIENT_ID");
  const clientSecret = requireEnv("AMO_CLIENT_SECRET");
  const redirectUri = requireEnv("AMO_REDIRECT_URI");

  const existing = await getAmoIntegrationByCompany(params.companyId);

  const integration =
    existing ??
    (await db.integration.create({
      data: {
        companyId: params.companyId,
        type: IntegrationType.AMOCRM,
        enabled: true,
        config: { domain },
      },
      select: { id: true, enabled: true, config: true },
    }));

  const res = await fetchTimeout(
    `${OAUTH_BASE}/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code: params.code,
        redirect_uri: redirectUri,
      }),
    },
    TIMEOUT_MS
  );

  const data = (await parseJsonOrThrow(res)) as AmoOAuthTokenResponse;

  const tokens: AmoTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAtMs: Date.now() + data.expires_in * 1000,
  };

  const cfg: AmoConfig = {
    domain,
    tokens: maybeEncryptTokens(tokens),
    meta: { connectedAt: new Date().toISOString() },
  };

  await writeAmoConfig(integration.id, cfg);

  if (existing && !existing.enabled) {
    await db.integration.update({ where: { id: integration.id }, data: { enabled: true } });
  }

  return { integrationId: integration.id, config: cfg };
}

/* ============================================================
   TOKENS: GET / REFRESH
============================================================ */

function tokenExpired(tokens: AmoTokens): boolean {
  return tokens.expiresAtMs - TOKEN_EXPIRY_SKEW_MS <= Date.now();
}

export async function refreshAmoTokens(companyId: string): Promise<AmoTokens> {
  const integration = await getAmoIntegrationByCompany(companyId);
  if (!integration) throw new Error("amoCRM integration not found");

  const cfg = readAmoConfig(integration.config);
  if (!cfg.tokens) throw new Error("amoCRM tokens missing");

  const clientId = requireEnv("AMO_CLIENT_ID");
  const clientSecret = requireEnv("AMO_CLIENT_SECRET");
  const redirectUri = requireEnv("AMO_REDIRECT_URI");

  const current = maybeDecryptTokens(cfg.tokens);

  const res = await fetchTimeout(
    `${OAUTH_BASE}/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: current.refreshToken,
        redirect_uri: redirectUri,
      }),
    },
    TIMEOUT_MS
  );

  const data = (await parseJsonOrThrow(res)) as AmoOAuthTokenResponse;

  const next: AmoTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAtMs: Date.now() + data.expires_in * 1000,
  };

  const nextCfg: AmoConfig = {
    ...cfg,
    tokens: maybeEncryptTokens(next),
    meta: { ...(cfg.meta || {}), refreshedAt: new Date().toISOString() },
  };

  await writeAmoConfig(integration.id, nextCfg);
  return next;
}

export async function amoGetAccessTokenForCompany(companyId: string): Promise<{
  integrationId: string;
  domain: string;
  accessToken: string;
}> {
  const integration = await getAmoIntegrationByCompany(companyId);
  if (!integration) throw new Error("amoCRM integration not found");

  const cfg = readAmoConfig(integration.config);
  if (!cfg.tokens) throw new Error("amoCRM tokens missing");

  const tokens = maybeDecryptTokens(cfg.tokens);

  if (!tokenExpired(tokens)) {
    return { integrationId: integration.id, domain: cfg.domain, accessToken: tokens.accessToken };
  }

  const refreshed = await refreshAmoTokens(companyId);
  return { integrationId: integration.id, domain: cfg.domain, accessToken: refreshed.accessToken };
}

/* ============================================================
   REQUEST: retry/backoff + 401 refresh + 429 wait
============================================================ */

export async function amoRequest<T = any>(opts: AmoRequestOpts): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const retryMax = opts.retryMax ?? RETRY_MAX;

  let lastErr: AmoError | null = null;
  let refreshedOnce = false;

  for (let attempt = 0; attempt <= retryMax; attempt++) {
    try {
      const { domain, accessToken } = await amoGetAccessTokenForCompany(opts.companyId);

      const url = `https://${domain}${opts.path}${buildQuery(opts.query)}`;
      const res = await fetchTimeout(
        url,
        {
          method: opts.method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: opts.body ? JSON.stringify(opts.body) : undefined,
        },
        timeoutMs
      );

      if (res.status === 401 && !opts.disableAutoRefresh && !refreshedOnce) {
        refreshedOnce = true;
        await refreshAmoTokens(opts.companyId);
        continue;
      }

      if (res.status === 429) {
        const ra = res.headers.get("retry-after");
        const waitMs = ra ? Math.max(0, Number(ra) * 1000) : computeBackoffMs(attempt);
        await sleep(waitMs);
        continue;
      }

      const json = await parseJsonOrThrow(res);
      return json as T;
    } catch (e) {
      lastErr = asAmoError(e);

      const nonRetry =
        lastErr.status === 400 ||
        lastErr.status === 401 ||
        lastErr.status === 403 ||
        lastErr.status === 404;

      if (attempt >= retryMax || nonRetry) break;

      await sleep(computeBackoffMs(attempt));
    }
  }

  throw lastErr ?? { status: 0, message: "amoRequest failed" };
}

/* ============================================================
   PAGINATION HELPER
============================================================ */

export async function amoFetchAllPages<TItem>(params: {
  companyId: string;
  path: string;
  perPage?: number;
  maxPages?: number;
  embeddedKey?: string; // default "items"
  query?: Record<string, string | number | boolean | undefined>;
}): Promise<TItem[]> {
  const perPage = Math.max(10, Math.min(250, params.perPage ?? 50));
  const maxPages = Math.max(1, Math.min(200, params.maxPages ?? 20));
  const embeddedKey = params.embeddedKey ?? "items";

  const out: TItem[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const json = await amoRequest<any>({
      companyId: params.companyId,
      method: "GET",
      path: params.path,
      query: { ...(params.query || {}), page, limit: perPage },
    });

    const items: TItem[] = json?._embedded?.[embeddedKey] ?? [];
    if (!items.length) break;

    out.push(...items);
    if (items.length < perPage) break;
  }

  return out;
}

/* ============================================================
   NORMALIZATION (THE IMPORTANT PART)
   Цель: стабильно получить:
   - externalId (always)
   - occurredAt/duration
   - phone/linePhone
   - audioUrl (as often as possible)
   - raw saved
============================================================ */

function pickFirstString(...vals: any[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function pickFirstNumber(...vals: any[]): number | undefined {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}

function toDateMaybe(v: any): Date | undefined {
  if (typeof v === "number") {
    if (v > 10_000_000_000) return new Date(v); // ms
    if (v > 1_000_000_000) return new Date(v * 1000); // sec
    return undefined;
  }
  if (typeof v === "string") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return undefined;
}

function normalizeDirection(v: any): "inbound" | "outbound" | "unknown" {
  const s = (v ?? "").toString().trim().toLowerCase();
  if (["in", "inbound", "incoming", "1"].includes(s)) return "inbound";
  if (["out", "outbound", "outgoing", "2"].includes(s)) return "outbound";
  return "unknown";
}

function looksLikeCallObject(x: any): boolean {
  if (!x || typeof x !== "object") return false;
  return Boolean(
    x.id ||
      x.uuid ||
      x.call_id ||
      x.duration ||
      x.duration_sec ||
      x.audio_url ||
      x.recording_url ||
      x.from ||
      x.to ||
      x.phone ||
      x.created_at ||
      x.occurred_at
  );
}

function tryGetEmbeddedCall(raw: any): any {
  const candidates = [
    raw?.call,
    raw?.data?.call,
    raw?._embedded?.call,
    raw?._embedded?.calls?.[0],
    raw?.params?.call,
    raw,
  ].filter(Boolean);

  for (const c of candidates) {
    if (looksLikeCallObject(c)) return c;
  }

  if (looksLikeCallObject(raw?.params)) return raw.params;
  return raw;
}

function normalizeAudioUrl(obj: any): string | undefined {
  const direct = pickFirstString(
    obj?.audio_url,
    obj?.recording_url,
    obj?.record_url,
    obj?.recording?.url,
    obj?.recording?.link,
    obj?.record?.url,
    obj?.record?.link,
    obj?.link,
    obj?.url,

    // often in params
    obj?.params?.audio_url,
    obj?.params?.recording_url,
    obj?.params?.link
  );

  const fromLinks =
    Array.isArray(obj?.links)
      ? pickFirstString(
          obj.links.find((x: any) => x?.type === "recording")?.href,
          obj.links[0]?.href
        )
      : undefined;

  const fromUnderscoreLinks = pickFirstString(obj?._links?.recording?.href, obj?._links?.self?.href);

  const fromAttachments =
    Array.isArray(obj?.attachments)
      ? pickFirstString(
          obj.attachments.find((a: any) => a?.type === "recording")?.url,
          obj.attachments[0]?.url
        )
      : undefined;

  const out = direct || fromLinks || fromUnderscoreLinks || fromAttachments;
  if (!out) return undefined;

  try {
    const u = new URL(out);
    if (u.protocol === "http:" || u.protocol === "https:") return out;
  } catch {}
  return undefined;
}

function makeExternalId(raw: any, obj: any, occurredAt?: Date, phone?: string, durationSec?: number): string | undefined {
  const base =
    pickFirstString(obj?.id, obj?.uuid, obj?.call_id, raw?.id, raw?.uuid, raw?.call_id) ||
    pickFirstString(raw?.note?.id, raw?.note_id, raw?.element_id);

  if (base) return String(base);

  const ts = occurredAt ? occurredAt.toISOString() : "";
  const ph = phone ? String(phone) : "";
  const dur = Number.isFinite(Number(durationSec)) ? String(durationSec) : "";
  const composed = [ts, ph, dur].filter(Boolean).join("|");
  if (!composed) return undefined;

  return crypto.createHash("sha1").update(composed).digest("hex");
}

export function normalizeAmoCall(raw: any): AmoCallDTO | null {
  const obj = tryGetEmbeddedCall(raw);

  const occurredAt =
    toDateMaybe(obj?.occurred_at) ||
    toDateMaybe(obj?.created_at) ||
    toDateMaybe(obj?.date) ||
    toDateMaybe(obj?.timestamp) ||
    toDateMaybe(raw?.occurred_at) ||
    toDateMaybe(raw?.created_at) ||
    toDateMaybe(raw?.date);

  const durationSec =
    pickFirstNumber(obj?.duration, obj?.duration_sec, obj?.durationSeconds, obj?.talk_time, raw?.duration, raw?.duration_sec) ??
    undefined;

  const direction = normalizeDirection(obj?.direction ?? obj?.dir ?? obj?.call_direction ?? raw?.direction);

  const phone = pickFirstString(
    obj?.phone,
    obj?.client_phone,
    obj?.contact_phone,
    obj?.from,
    obj?.src,
    obj?.source,
    obj?.caller,
    obj?.caller_phone,
    obj?.phone_from,
    raw?.phone,
    raw?.from
  );

  const linePhone = pickFirstString(
    obj?.line_phone,
    obj?.to,
    obj?.dst,
    obj?.destination,
    obj?.callee,
    obj?.callee_phone,
    obj?.phone_to,
    raw?.to
  );

  const externalId = makeExternalId(raw, obj, occurredAt, phone, durationSec);
  if (!externalId) return null;

  const audioUrl = normalizeAudioUrl(obj) || normalizeAudioUrl(raw);

  const leadId = pickFirstString(obj?.lead_id, obj?.leadId, obj?.entity_id, obj?.element_id, raw?.lead_id);
  const leadName = pickFirstString(obj?.lead_name, obj?.leadName);
  const leadUrl = pickFirstString(obj?.lead_url, obj?.leadUrl);

  const pipelineId = pickFirstString(obj?.pipeline_id, obj?.pipelineId);
  const pipelineName = pickFirstString(obj?.pipeline_name, obj?.pipelineName);

  const stageId = pickFirstString(obj?.stage_id, obj?.stageId, obj?.status_id);
  const stageName = pickFirstString(obj?.stage_name, obj?.stageName, obj?.status_name);

  const amountKzt = pickFirstNumber(obj?.amount, obj?.price, obj?.sum, obj?.budget);

  return {
    externalId,
    occurredAt,
    durationSec,
    direction,
    phone,
    linePhone,
    audioUrl,
    leadId,
    leadName,
    leadUrl,
    pipelineId,
    pipelineName,
    stageId,
    stageName,
    amountKzt,
    raw,
  };
}

/* ============================================================
   OPTIONAL: refresh all tokens (cron)
============================================================ */

export async function refreshAllAmoTokens(params?: {
  take?: number;
  onlyExpired?: boolean;
}): Promise<{
  ok: boolean;
  total: number;
  refreshed: number;
  skipped: number;
  failed: number;
  errors: Array<{ companyId: string; error: string }>;
}> {
  const take = Math.max(1, Math.min(2000, params?.take ?? 500));
  const onlyExpired = params?.onlyExpired ?? true;

  const integrations = await db.integration.findMany({
    where: { type: IntegrationType.AMOCRM, enabled: true },
    take,
    select: { companyId: true, config: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  let refreshed = 0;
  let skipped = 0;
  const errors: Array<{ companyId: string; error: string }> = [];

  for (const it of integrations) {
    try {
      const cfg = readAmoConfig(it.config);
      if (!cfg.tokens) {
        skipped += 1;
        continue;
      }

      if (onlyExpired) {
        const tokens = maybeDecryptTokens(cfg.tokens);
        if (!tokenExpired(tokens)) {
          skipped += 1;
          continue;
        }
      }

      await refreshAmoTokens(it.companyId);
      refreshed += 1;
    } catch (e: any) {
      errors.push({ companyId: it.companyId, error: e?.message ?? String(e ?? "Unknown error") });
    }
  }

  return {
    ok: errors.length === 0,
    total: integrations.length,
    refreshed,
    skipped,
    failed: errors.length,
    errors,
  };
}

/* ============================================================
   HARDENING: redact config in logs
============================================================ */

export function redactAmoConfigForLogs(cfg: AmoConfig): Record<string, any> {
  return {
    domain: cfg.domain,
    accountId: cfg.accountId,
    hasTokens: !!cfg.tokens,
    tokensEncrypted: !!(cfg.tokens as any)?.enc,
    expiresAtMs: (cfg.tokens as any)?.expiresAtMs,
  };
}
