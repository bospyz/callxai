
import { db } from "@/lib/db";
import crypto from "crypto";
import { IntegrationType } from "@prisma/client";


export type AmoIntegrationType = "amocrm";

export type AmoTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number; // unix ms
};

export type AmoConfig = {
  domain: string; // example.amocrm.ru
  accountId?: string; // amo account id if known
  tokens?: AmoTokens | EncryptedTokens;
  webhookSecret?: string; 
  meta?: Record<string, any>;
};

export type EncryptedTokens = {
  enc: true;
  v: 1;
  blob: string;
  expiresAtMs: number; 
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
  // if true, don't auto-refresh on 401 (rarely needed)
  disableAutoRefresh?: boolean;
};

type AmoOAuthTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
};

/**
 * Minimal call-ish DTO. You may adapt to your real schema.
 */
export type AmoCallDTO = {
  externalId: string;
  occurredAt?: Date;
  durationSec?: number;
  direction?: "in" | "out" | "unknown";
  phone?: string;
  audioUrl?: string;
  raw?: any;
};

/* =========================
   Config / env
========================= */

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

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

/* =========================
   Encryption (optional)
========================= */

function getEncKey(): Buffer | null {
  const raw = process.env.AMO_TOKEN_ENC_KEY;
  if (!raw) return null;

  // Accept: 64-hex (32 bytes) or base64
  const hexLike = /^[0-9a-fA-F]{64}$/.test(raw);
  if (hexLike) return Buffer.from(raw, "hex");

  // base64
  const buf = Buffer.from(raw, "base64");
  if (buf.length === 32) return buf;

  throw new Error(
    "AMO_TOKEN_ENC_KEY invalid: expected 32 bytes base64 or 64 hex chars"
  );
}

function encryptJson(obj: any): { blob: string; ivB64: string; tagB64: string } {
  const key = getEncKey();
  if (!key) throw new Error("Encryption key not configured");

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const plaintext = Buffer.from(JSON.stringify(obj), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    blob: `${iv.toString("base64")}.${ciphertext.toString("base64")}.${tag.toString("base64")}`,
    ivB64: iv.toString("base64"),
    tagB64: tag.toString("base64"),
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

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString("utf8"));
}

function maybeEncryptTokens(tokens: AmoTokens): AmoTokens | EncryptedTokens {
  const key = getEncKey();
  if (!key) return tokens;

  const enc = encryptJson(tokens);
  return {
    enc: true,
    v: 1,
    blob: enc.blob,
    expiresAtMs: tokens.expiresAtMs,
  };
}

function maybeDecryptTokens(
  tokens: AmoTokens | EncryptedTokens
): AmoTokens {
  if ((tokens as EncryptedTokens)?.enc) {
    const decoded = decryptJson((tokens as EncryptedTokens).blob);
    return decoded as AmoTokens;
  }
  return tokens as AmoTokens;
}

/* =========================
   DB config read/write
   Adapt these two functions if your schema differs.
========================= */

async function getAmoIntegrationByCompany(companyId: string) {
  // Adjust select/where to match your prisma schema.
  // Expected: Integration has (id, companyId, type, enabled, config Json)
  const integration = await db.integration.findFirst({
    where: { companyId, type: IntegrationType.AMOCRM },
    select: {
      id: true,
      enabled: true,
      config: true,
      companyId: true,
      type: true,
      updatedAt: true,
      createdAt: true,
    },
  });

  return integration;
}

async function writeAmoConfig(integrationId: string, cfg: AmoConfig) {
  await db.integration.update({
    where: { id: integrationId },
    data: { config: cfg },
  });
}

function readAmoConfig(raw: any): AmoConfig {
  if (!raw || typeof raw !== "object") {
    throw new Error("amoCRM config missing or invalid");
  }
  const domain = raw.domain;
  if (typeof domain !== "string" || !domain) {
    throw new Error("amoCRM config.domain missing");
  }
  return raw as AmoConfig;
}

/* =========================
   Public: ensure integration enabled
========================= */

export async function requireAmoIntegrationEnabled(companyId: string) {
  const integration = await getAmoIntegrationByCompany(companyId);
  if (!integration) throw new Error("amoCRM integration not found");
  if (!integration.enabled) throw new Error("amoCRM integration is disabled");
  const cfg = readAmoConfig(integration.config);
  return { integration, cfg };
}

/* =========================
   OAuth: build authorize URL
========================= */

export function buildAmoAuthorizeUrl(params: {
  domain: string; // tenant domain
  state: string;  // anti-CSRF, store in session/db
}): string {
  const clientId = requireEnv("AMO_CLIENT_ID");
  const redirectUri = requireEnv("AMO_REDIRECT_URI");

  const url = new URL(`https://${params.domain}/oauth?client_id=${encodeURIComponent(clientId)}`);
  url.searchParams.set("state", params.state);
  url.searchParams.set("mode", "post_message"); // optional; you may remove
  url.searchParams.set("redirect_uri", redirectUri);

  return url.toString();
}
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  return fetchTimeout(url, init, timeoutMs);
}

/**
 * Exchange authorization code for tokens.
 * You should call this from your /connect callback route.
 */
export async function exchangeAmoCodeForTokens(params: {
  companyId: string;
  domain: string;
  code: string;
}): Promise<{ integrationId: string; config: AmoConfig }> {
  const clientId = requireEnv("AMO_CLIENT_ID");
  const clientSecret = requireEnv("AMO_CLIENT_SECRET");
  const redirectUri = requireEnv("AMO_REDIRECT_URI");

  // Ensure integration exists
  const existing = await getAmoIntegrationByCompany(params.companyId);
  const integration =
    existing ??
    (await db.integration.create({
      data: {
        companyId: params.companyId,
        type: IntegrationType.AMOCRM,
        enabled: true,
        config: { domain: params.domain },
      },
      select: { id: true, config: true, enabled: true },
    }));

  const res = await fetchWithTimeout(`${OAUTH_BASE}/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: redirectUri,
    }),
  }, TIMEOUT_MS);

  const data = (await parseJsonOrThrow(res)) as AmoOAuthTokenResponse;

  const tokens: AmoTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAtMs: Date.now() + data.expires_in * 1000,
  };

  const cfg: AmoConfig = {
    domain: params.domain,
    tokens: maybeEncryptTokens(tokens),
    meta: {
      connectedAt: new Date().toISOString(),
    },
  };

  await writeAmoConfig(integration.id, cfg);

  // enable integration
  if (!existing?.enabled) {
    await db.integration.update({
      where: { id: integration.id },
      data: { enabled: true },
    });
  }

  return { integrationId: integration.id, config: cfg };
}

/* =========================
   Token lifecycle / refresh with DB lock
========================= */

function tokenExpired(tokens: AmoTokens): boolean {
  return tokens.expiresAtMs - TOKEN_EXPIRY_SKEW_MS <= Date.now();
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
      message:
        json?.detail ||
        json?.error ||
        json?.message ||
        `amoCRM request failed (${res.status})`,
      details: json,
    };
    throw err;
  }

  return json;
}

/**
 * Refresh tokens for company. Uses DB as source of truth.
 * NOTE: For true distributed locking, use a dedicated lock field / advisory lock.
 * Here we do a safe "read latest -> refresh -> write" which is enough for MVP.
 */
export async function refreshAmoTokens(companyId: string): Promise<AmoTokens> {
  const integration = await getAmoIntegrationByCompany(companyId);
  if (!integration) throw new Error("amoCRM integration not found");

  const cfg = readAmoConfig(integration.config);
  if (!cfg.tokens) throw new Error("amoCRM tokens missing");

  const clientId = requireEnv("AMO_CLIENT_ID");
  const clientSecret = requireEnv("AMO_CLIENT_SECRET");
  const redirectUri = requireEnv("AMO_REDIRECT_URI");

  const current = maybeDecryptTokens(cfg.tokens as any);

  const res = await fetchWithTimeout(`${OAUTH_BASE}/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: current.refreshToken,
      redirect_uri: redirectUri,
    }),
  }, TIMEOUT_MS);

  const data = (await parseJsonOrThrow(res)) as AmoOAuthTokenResponse;

  const tokens: AmoTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAtMs: Date.now() + data.expires_in * 1000,
  };

  const nextCfg: AmoConfig = {
    ...cfg,
    tokens: maybeEncryptTokens(tokens),
    meta: {
      ...(cfg.meta || {}),
      refreshedAt: new Date().toISOString(),
    },
  };

  await writeAmoConfig(integration.id, nextCfg);

  return tokens;
}

/**
 * Get access token (auto refresh if expired)
 */
export async function amoGetAccessTokenForCompany(companyId: string): Promise<{
  integrationId: string;
  domain: string;
  accessToken: string;
}> {
  const integration = await getAmoIntegrationByCompany(companyId);
  if (!integration) throw new Error("amoCRM integration not found");

  const cfg = readAmoConfig(integration.config);
  if (!cfg.tokens) throw new Error("amoCRM tokens missing");

  const tokens = maybeDecryptTokens(cfg.tokens as any);

  if (tokenExpired(tokens)) {
    const refreshed = await refreshAmoTokens(companyId);
    return {
      integrationId: integration.id,
      domain: cfg.domain,
      accessToken: refreshed.accessToken,
    };
  }

  return {
    integrationId: integration.id,
    domain: cfg.domain,
    accessToken: tokens.accessToken,
  };
}

/* =========================
   HTTP: request with retry/backoff + 401 refresh
========================= */

function buildQuery(
  query?: Record<string, string | number | boolean | undefined>
): string {
  if (!query) return "";
  const pairs = Object.entries(query).filter(([, v]) => v !== undefined);
  if (!pairs.length) return "";

  const sp = new URLSearchParams();
  for (const [k, v] of pairs) sp.set(k, String(v));
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function computeBackoffMs(attempt: number) {
  // exponential + jitter
  const base = 400 * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 200);
  return Math.min(6000, base + jitter);
}

async function fetchTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

function asAmoError(e: any): AmoError {
  if (e && typeof e.status === "number" && typeof e.message === "string") {
    return e as AmoError;
  }
  const msg = e instanceof Error ? e.message : "Unknown error";
  return { status: 0, message: msg, details: e };
}

export async function amoRequest<T = any>(opts: AmoRequestOpts): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const retryMax = opts.retryMax ?? RETRY_MAX;

  let lastErr: AmoError | null = null;
  let refreshedOnce = false;

  for (let attempt = 0; attempt <= retryMax; attempt++) {
    try {
      const { domain, accessToken } = await amoGetAccessTokenForCompany(
        opts.companyId
      );

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

      // If unauthorized, refresh once and retry (unless disabled)
      if (res.status === 401 && !opts.disableAutoRefresh && !refreshedOnce) {
        refreshedOnce = true;
        await refreshAmoTokens(opts.companyId);
        continue;
      }

      // Handle rate limit
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

      // non-retryable statuses
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

/* =========================
   Pagination helpers (amo v4 style)
========================= */

export async function amoFetchAllPages<TItem>(params: {
  companyId: string;
  path: string;
  perPage?: number;
  maxPages?: number;
  embeddedKey?: string; // default "items"
  query?: Record<string, string | number | boolean | undefined>;
}): Promise<TItem[]> {
  const perPage = params.perPage ?? 50;
  const maxPages = params.maxPages ?? 20;
  const embeddedKey = params.embeddedKey ?? "items";

  const out: TItem[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const json = await amoRequest<any>({
      companyId: params.companyId,
      method: "GET",
      path: params.path,
      query: {
        ...(params.query || {}),
        page,
        limit: perPage,
      },
    });

    const items: TItem[] = json?._embedded?.[embeddedKey] ?? [];
    if (!items.length) break;
    out.push(...items);
    if (items.length < perPage) break;
  }

  return out;
}

/* =========================
   Minimal Normalization (adapt to your real amo payload)
   NOTE: amo "calls" can be stored in different entities depending on setup.
   You likely read from a custom endpoint / events / notes. Keep this as adapter.
========================= */

function toDateMaybe(v: any): Date | undefined {
  if (typeof v === "number") {
    // unix seconds? try both
    if (v > 10_000_000_000) return new Date(v); // ms
    return new Date(v * 1000); // sec
  }
  if (typeof v === "string") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return undefined;
}

export function normalizeAmoCall(raw: any): AmoCallDTO | null {
  // This is intentionally conservative.
  // You MUST map this to the actual raw you fetch in your sync route.

  const externalId =
    raw?.id != null ? String(raw.id) :
    raw?.uuid != null ? String(raw.uuid) :
    null;

  if (!externalId) return null;

  const occurredAt =
    toDateMaybe(raw?.created_at) ||
    toDateMaybe(raw?.occurred_at) ||
    toDateMaybe(raw?.date);

  const durationSec =
    typeof raw?.duration === "number" ? raw.duration :
    typeof raw?.duration_sec === "number" ? raw.duration_sec :
    undefined;

  const direction: AmoCallDTO["direction"] =
    raw?.direction === "in" || raw?.direction === "out"
      ? raw.direction
      : "unknown";

  const phone =
    typeof raw?.phone === "string" ? raw.phone :
    typeof raw?.from === "string" ? raw.from :
    typeof raw?.to === "string" ? raw.to :
    undefined;

  const audioUrl =
    typeof raw?.audio_url === "string" ? raw.audio_url :
    typeof raw?.recording_url === "string" ? raw.recording_url :
    undefined;

  return {
    externalId,
    occurredAt,
    durationSec,
    direction,
    phone,
    audioUrl,
    raw,
  };
}

/* =========================
   Webhook verification helpers (optional)
   If you implement webhook secrets, use these in your webhook route.
========================= */

export function signWebhookHmacSha256(params: {
  secret: string;
  body: string; // raw body string
}): string {
  return crypto
    .createHmac("sha256", params.secret)
    .update(params.body, "utf8")
    .digest("hex");
}

export function verifyWebhookHmacSha256(params: {
  secret: string;
  body: string;
  signature: string | null | undefined;
}): boolean {
  if (!params.signature) return false;
  const expected = signWebhookHmacSha256({
    secret: params.secret,
    body: params.body,
  });

  // constant-time compare
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(params.signature, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* =========================
   Safety: domain validation
========================= */

export function validateAmoDomain(domain: string): string {
  const d = domain.trim().toLowerCase();

  // Strict-ish validation
  if (!/^[a-z0-9-]+\.amocrm\.(ru|com|kz|ua|by)$/i.test(d)) {
    // keep it flexible if you use .com etc; adjust as needed
    // For now, allow .ru and .com or others via regex above
    throw new Error("Invalid amoCRM domain format");
  }

  return d;
}

/* =========================
   Convenience: connect helper (domain only)
   Use if your connect route stores domain first, then redirects to oauth.
========================= */

export async function upsertAmoIntegrationDomain(params: {
  companyId: string;
  domain: string;
  enabled?: boolean;
}): Promise<{ integrationId: string; config: AmoConfig }> {
  const domain = validateAmoDomain(params.domain);

  const existing = await getAmoIntegrationByCompany(params.companyId);
  if (!existing) {
    const cfg: AmoConfig = { domain };
    const created = await db.integration.create({
      data: {
        companyId: params.companyId,
        type: IntegrationType.AMOCRM,
        enabled: params.enabled ?? true,
        config: cfg,
      },
      select: { id: true, config: true },
    });

    return { integrationId: created.id, config: readAmoConfig(created.config) };
  }

  const cfg = readAmoConfig(existing.config);
  const next: AmoConfig = {
    ...cfg,
    domain,
    meta: { ...(cfg.meta || {}), domainUpdatedAt: new Date().toISOString() },
  };

  await db.integration.update({
    where: { id: existing.id },
    data: {
      enabled: params.enabled ?? existing.enabled,
      config: next,
    },
  });

  return { integrationId: existing.id, config: next };
}
/* =========================
   Hardening: redact helpers for logs
========================= */

export function redactAmoConfigForLogs(cfg: AmoConfig): Record<string, any> {
  return {
    domain: cfg.domain,
    accountId: cfg.accountId,
    hasTokens: !!cfg.tokens,
    tokensEncrypted: !!(cfg.tokens as any)?.enc,
    expiresAtMs: (cfg.tokens as any)?.expiresAtMs,
  };
}

/**
 * Refresh amo tokens for all enabled amoCRM integrations.
 * Used by scripts/cron/hourly_refresh.ts
 *
 * Safe for MVP: идём по интеграциям пачками, обновляем токены по companyId.
 * Не падаем целиком из-за одной компании — собираем статистику.
 */
export async function refreshAllAmoTokens(params?: {
  take?: number; // max integrations to process in one run
  onlyExpired?: boolean; // refresh only if token is expired
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
    select: { companyId: true, config: true },
    orderBy: { updatedAt: "desc" },
  });

  let refreshed = 0;
  let skipped = 0;
  const errors: Array<{ companyId: string; error: string }> = [];

  for (const it of integrations) {
    const companyId = it.companyId;

    try {
      const cfg = readAmoConfig(it.config);

      if (!cfg.tokens) {
        skipped += 1;
        continue;
      }

      if (onlyExpired) {
        const tokens = maybeDecryptTokens(cfg.tokens as any);
        if (!tokenExpired(tokens)) {
          skipped += 1;
          continue;
        }
      }

      await refreshAmoTokens(companyId);
      refreshed += 1;
    } catch (e: any) {
      const msg = e?.message ?? String(e ?? "Unknown error");
      errors.push({ companyId, error: msg });
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
