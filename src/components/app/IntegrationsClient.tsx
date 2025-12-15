"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { UiIntegration } from "@/lib/integration-ui";

type Props = {
  amo: UiIntegration | null;
  bitrix: UiIntegration | null;
  webhook: UiIntegration | null;
};


/* =========================
   Types
========================= */

type QuotaResponse = {
  ok: boolean;
  companyId?: string;
  plan: string; // FREE / START / PRO / ENTERPRISE
  hasActiveSub?: boolean;
  reason?:
    | "no-subscription"
    | "within-free-limit"
    | "free-limit-exceeded"
    | "paid-plan-limited"
    | "paid-plan-unlimited";
  limit: number | null;
  used: number | null;
  remaining: number | null;
  billableMinDurationSec: number;
};

type GenericOk = {
  ok: boolean;
  message?: string;
  error?: string;
};

type SyncResponse = {
  ok: boolean;
  created?: number;
  skipped?: number;
  seenRaw?: number;
  quotaWarning?: string;
  message?: string;
};

type WebhookInfoResponse = {
  ok: boolean;
  url?: string;
  secret?: string;
  message?: string;
};

type TestWebhookResponse = {
  ok: boolean;
  delivered?: boolean;
  message?: string;
};

type ButtonState = "idle" | "loading";

/* =========================
   Helpers
========================= */

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function safeString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function safeNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

async function fetchJSON<T>(
  input: RequestInfo,
  init?: RequestInit
): Promise<
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; data?: any }
> {
  try {
    const res = await fetch(input, init);
    const status = res.status;

    let json: any = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }

    if (!res.ok) {
      const msg =
        safeString(json?.message) ||
        safeString(json?.error) ||
        `Request failed (${status})`;
      return { ok: false, status, error: msg, data: json };
    }

    return { ok: true, status, data: json as T };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { ok: false, status: 0, error: msg };
  }
}

function formatQuota(q: QuotaResponse | null) {
  if (!q) return "Квота: —";
  const used = q.used ?? 0;
  const limit = q.limit;
  if (limit == null) return `Квота: ${used} / ∞`;
  return `Квота: ${used} / ${limit}`;
}

function statusBadge(enabled: boolean) {
  if (enabled) {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-700/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
        Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-xs text-neutral-300">
      Not connected
    </span>
  );
}

function normalizeSyncResponse(raw: any): SyncResponse {
  return {
    ok: !!raw?.ok,
    created: safeNumber(raw?.created),
    skipped: safeNumber(raw?.skipped),
    seenRaw: safeNumber(raw?.seenRaw),
    quotaWarning: safeString(raw?.quotaWarning),
    message: safeString(raw?.message),
  };
}

/* =========================
   Component
========================= */

export function IntegrationsClient({ amo, bitrix, webhook }: Props) {
  // Global banners
  const [globalMsg, setGlobalMsg] = useState<string | null>(null);
  const [globalErr, setGlobalErr] = useState<string | null>(null);

  // Quota
  const [quota, setQuota] = useState<QuotaResponse | null>(null);
  const [quotaState, setQuotaState] = useState<ButtonState>("idle");

  // AMO controls
  const [amoDomain, setAmoDomain] = useState<string>(
    (amo?.config as any)?.domain ? String((amo?.config as any)?.domain) : ""
  );
  const [amoState, setAmoState] = useState<ButtonState>("idle");
  const [amoSyncState, setAmoSyncState] = useState<ButtonState>("idle");
  const [amoMsg, setAmoMsg] = useState<string | null>(null);
  const [amoErr, setAmoErr] = useState<string | null>(null);
  const [amoStats, setAmoStats] = useState<{
    created?: number;
    skipped?: number;
    seenRaw?: number;
  } | null>(null);

  // Bitrix controls
  const [bitrixState, setBitrixState] = useState<ButtonState>("idle");
  const [bitrixMsg, setBitrixMsg] = useState<string | null>(null);
  const [bitrixErr, setBitrixErr] = useState<string | null>(null);

  // Webhook controls
  const [webhookState, setWebhookState] = useState<ButtonState>("idle");
  const [webhookMsg, setWebhookMsg] = useState<string | null>(null);
  const [webhookErr, setWebhookErr] = useState<string | null>(null);
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfoResponse | null>(
    null
  );
  const [webhookTestState, setWebhookTestState] =
    useState<ButtonState>("idle");

  const quotaText = useMemo(() => formatQuota(quota), [quota]);

  function resetGlobal() {
    setGlobalMsg(null);
    setGlobalErr(null);
  }

  /* =========================
     Load quota + webhook info
  ========================= */
  useEffect(() => {
    (async () => {
      setQuotaState("loading");
      const r = await fetchJSON<QuotaResponse>("/api/billing/quota");
      if (r.ok && (r.data as any)?.ok) setQuota(r.data);
      setQuotaState("idle");
    })();

    (async () => {
      const r = await fetchJSON<WebhookInfoResponse>(
        "/api/integrations/webhook/info"
      );
      if (r.ok && (r.data as any)?.ok) setWebhookInfo(r.data);
    })();
  }, []);

  /* =========================
     AMO: Connect / Sync / Disconnect
  ========================= */

  async function amoConnect() {
    resetGlobal();
    setAmoMsg(null);
    setAmoErr(null);
    setAmoStats(null);

    const domain = amoDomain.trim();
    if (!domain) {
      setAmoErr("Укажи домен amoCRM (например: example.amocrm.ru)");
      return;
    }

    setAmoState("loading");

    const r = await fetchJSON<GenericOk>("/api/integrations/amocrm/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    });

    if (!r.ok) {
      setAmoErr(r.error);
      setAmoState("idle");
      return;
    }

    if (!r.data.ok) {
      setAmoErr(r.data.message || "Connect failed");
      setAmoState("idle");
      return;
    }

    setAmoMsg(r.data.message || "amoCRM подключён. Обнови страницу.");
    setAmoState("idle");
  }

  async function amoSync() {
    resetGlobal();
    setAmoMsg(null);
    setAmoErr(null);
    setAmoStats(null);

    setAmoSyncState("loading");
    const r = await fetchJSON<any>("/api/integrations/amocrm/sync", {
      method: "POST",
    });

    if (!r.ok) {
      setAmoErr(r.error);
      setAmoSyncState("idle");
      return;
    }

    const data = normalizeSyncResponse(r.data);
    if (!data.ok) {
      setAmoErr(data.message || "Sync failed");
      setAmoSyncState("idle");
      return;
    }

    setAmoStats({
      created: data.created,
      skipped: data.skipped,
      seenRaw: data.seenRaw,
    });

    setAmoMsg(data.quotaWarning || data.message || "Синхронизация завершена.");

    const q = await fetchJSON<QuotaResponse>("/api/billing/quota");
    if (q.ok && (q.data as any)?.ok) setQuota(q.data);

    setAmoSyncState("idle");
  }

  async function amoDisconnect() {
    resetGlobal();
    setAmoMsg(null);
    setAmoErr(null);

    setAmoState("loading");

    const r = await fetchJSON<GenericOk>("/api/integrations/amocrm/disconnect", {
      method: "POST",
    });

    if (!r.ok) {
      setAmoErr(r.error);
      setAmoState("idle");
      return;
    }

    if (!r.data.ok) {
      setAmoErr(r.data.message || "Disconnect failed");
      setAmoState("idle");
      return;
    }

    setAmoMsg(r.data.message || "amoCRM отключён. Обнови страницу.");
    setAmoState("idle");
  }

  /* =========================
     Bitrix: Connect / Disconnect (optional)
  ========================= */

  async function bitrixConnect() {
    resetGlobal();
    setBitrixMsg(null);
    setBitrixErr(null);

    setBitrixState("loading");

    const r = await fetchJSON<GenericOk>("/api/integrations/bitrix/connect", {
      method: "POST",
    });

    if (!r.ok) {
      setBitrixErr(r.error);
      setBitrixState("idle");
      return;
    }

    if (!r.data.ok) {
      setBitrixErr(r.data.message || "Bitrix connect failed");
      setBitrixState("idle");
      return;
    }

    setBitrixMsg(r.data.message || "Bitrix подключён. Обнови страницу.");
    setBitrixState("idle");
  }

  async function bitrixDisconnect() {
    resetGlobal();
    setBitrixMsg(null);
    setBitrixErr(null);

    setBitrixState("loading");

    const r = await fetchJSON<GenericOk>("/api/integrations/bitrix/disconnect", {
      method: "POST",
    });

    if (!r.ok) {
      setBitrixErr(r.error);
      setBitrixState("idle");
      return;
    }

    if (!r.data.ok) {
      setBitrixErr(r.data.message || "Bitrix disconnect failed");
      setBitrixState("idle");
      return;
    }

    setBitrixMsg(r.data.message || "Bitrix отключён. Обнови страницу.");
    setBitrixState("idle");
  }

  /* =========================
     Webhook: Info / Regenerate / Test
  ========================= */

  async function webhookRefreshInfo() {
    resetGlobal();
    setWebhookMsg(null);
    setWebhookErr(null);

    setWebhookState("loading");

    const r = await fetchJSON<WebhookInfoResponse>(
      "/api/integrations/webhook/info"
    );

    if (!r.ok) {
      setWebhookErr(r.error);
      setWebhookState("idle");
      return;
    }

    if (!r.data.ok) {
      setWebhookErr(r.data.message || "Webhook info failed");
      setWebhookState("idle");
      return;
    }

    setWebhookInfo(r.data);
    setWebhookMsg(r.data.message || "Webhook info updated");
    setWebhookState("idle");
  }

  async function webhookRegenerateSecret() {
    resetGlobal();
    setWebhookMsg(null);
    setWebhookErr(null);

    setWebhookState("loading");

    const r = await fetchJSON<WebhookInfoResponse>(
      "/api/integrations/webhook/rotate-secret",
      { method: "POST" }
    );

    if (!r.ok) {
      setWebhookErr(r.error);
      setWebhookState("idle");
      return;
    }

    if (!r.data.ok) {
      setWebhookErr(r.data.message || "Rotate secret failed");
      setWebhookState("idle");
      return;
    }

    setWebhookInfo(r.data);
    setWebhookMsg(r.data.message || "Webhook secret regenerated");
    setWebhookState("idle");
  }

  async function webhookTest() {
    resetGlobal();
    setWebhookMsg(null);
    setWebhookErr(null);

    setWebhookTestState("loading");

    const r = await fetchJSON<TestWebhookResponse>(
      "/api/integrations/webhook/test",
      { method: "POST" }
    );

    if (!r.ok) {
      setWebhookErr(r.error);
      setWebhookTestState("idle");
      return;
    }

    if (!r.data.ok) {
      setWebhookErr(r.data.message || "Webhook test failed");
      setWebhookTestState("idle");
      return;
    }

    setWebhookMsg(r.data.message || "Webhook test delivered");
    setWebhookTestState("idle");
  }

  /* =========================
     UI Blocks
  ========================= */

  const Card = ({
    title,
    subtitle,
    right,
    children,
  }: {
    title: string;
    subtitle?: string;
    right?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div className="rounded-xl border border-neutral-800 bg-black/40 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-neutral-400">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );

  const MiniStat = ({ label, value }: { label: string; value: any }) => (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
      <div className="text-[11px] text-neutral-400">{label}</div>
      <div className="text-sm text-neutral-200">{String(value)}</div>
    </div>
  );

  const Banner = ({ kind, text }: { kind: "ok" | "error"; text: string }) => (
    <div
      className={cx(
        "rounded-lg border px-3 py-2 text-sm",
        kind === "ok" &&
          "border-emerald-700/40 bg-emerald-500/10 text-emerald-200",
        kind === "error" && "border-red-700/40 bg-red-500/10 text-red-200"
      )}
    >
      {text}
    </div>
  );

  return (
    <div className="space-y-6">
      {(globalMsg || globalErr) && (
        <div className="space-y-2">
          {globalMsg && <Banner kind="ok" text={globalMsg} />}
          {globalErr && <Banner kind="error" text={globalErr} />}
        </div>
      )}

      {/* Quota */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-neutral-200">Квота</div>
            <div className="mt-1 text-xs text-neutral-400">{quotaText}</div>
          </div>
          <button
            type="button"
            onClick={async () => {
              resetGlobal();
              setQuotaState("loading");
              const q = await fetchJSON<QuotaResponse>("/api/billing/quota");
              if (q.ok && (q.data as any)?.ok) setQuota(q.data);
              setQuotaState("idle");
            }}
            disabled={quotaState === "loading"}
            className="rounded-md border border-neutral-700 bg-black px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-900 disabled:opacity-60"
          >
            {quotaState === "loading" ? "Обновляю…" : "Обновить"}
          </button>
        </div>

        {quota?.reason === "free-limit-exceeded" && (
          <div className="mt-3">
            <Banner
              kind="error"
              text="Лимит FREE исчерпан. Обработка новых звонков может быть остановлена."
            />
          </div>
        )}

        <div className="mt-3 text-xs text-neutral-500">
          Billing:{" "}
          <Link className="text-neutral-300 hover:text-white" href="/app/billing">
            /app/billing
          </Link>
          {" · "}
          Integrations:{" "}
          <Link className="text-neutral-300 hover:text-white" href="/app/integrations">
            /app/integrations
          </Link>
        </div>
      </div>

      {/* AMO */}
      <Card
        title="amoCRM"
        subtitle="Подключение и синхронизация звонков из amoCRM"
        right={statusBadge(!!amo?.enabled)}
      >
        {amoMsg && (
          <div className="mb-3">
            <Banner kind="ok" text={amoMsg} />
          </div>
        )}
        {amoErr && (
          <div className="mb-3">
            <Banner kind="error" text={amoErr} />
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs text-neutral-400">Домен amoCRM</div>
            <input
              value={amoDomain}
              onChange={(e) => setAmoDomain(e.target.value)}
              placeholder="example.amocrm.ru"
              className="w-full rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
            />
            <div className="text-[11px] text-neutral-500">
              Если у тебя OAuth flow через редирект — connect endpoint может
              возвращать URL. В этом UI мы просто показываем message/ошибку.
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-neutral-400">Действия</div>

            {!amo?.enabled ? (
              <button
                type="button"
                onClick={amoConnect}
                disabled={amoState === "loading"}
                className="w-full rounded-md bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
              >
                {amoState === "loading" ? "Подключаю…" : "Подключить amoCRM"}
              </button>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={amoSync}
                  disabled={amoSyncState === "loading"}
                  className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
                >
                  {amoSyncState === "loading" ? "Sync…" : "Sync calls"}
                </button>

                <button
                  type="button"
                  onClick={amoDisconnect}
                  disabled={amoState === "loading"}
                  className="rounded-md border border-neutral-700 bg-black px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-900 disabled:opacity-60"
                >
                  {amoState === "loading" ? "…" : "Disconnect"}
                </button>
              </div>
            )}
          </div>
        </div>

        {amoStats && (
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <MiniStat label="Created" value={amoStats.created ?? 0} />
            <MiniStat label="Skipped" value={amoStats.skipped ?? 0} />
            <MiniStat label="Seen raw" value={amoStats.seenRaw ?? 0} />
          </div>
        )}

        <div className="mt-4 text-xs text-neutral-500">
          API: <span className="text-neutral-300">/api/integrations/amocrm/connect</span>{" "}
          · <span className="text-neutral-300">/api/integrations/amocrm/sync</span>{" "}
          · <span className="text-neutral-300">/api/integrations/amocrm/disconnect</span>
        </div>
      </Card>

      {/* Bitrix */}
      <Card
        title="Bitrix24"
        subtitle="Интеграция Bitrix (если включишь — делаем аналогично amo)"
        right={statusBadge(!!bitrix?.enabled)}
      >
        {bitrixMsg && (
          <div className="mb-3">
            <Banner kind="ok" text={bitrixMsg} />
          </div>
        )}
        {bitrixErr && (
          <div className="mb-3">
            <Banner kind="error" text={bitrixErr} />
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          {!bitrix?.enabled ? (
            <button
              type="button"
              onClick={bitrixConnect}
              disabled={bitrixState === "loading"}
              className="rounded-md border border-neutral-700 bg-black px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-900 disabled:opacity-60"
            >
              {bitrixState === "loading" ? "…" : "Подключить Bitrix"}
            </button>
          ) : (
            <button
              type="button"
              onClick={bitrixDisconnect}
              disabled={bitrixState === "loading"}
              className="rounded-md border border-neutral-700 bg-black px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-900 disabled:opacity-60"
            >
              {bitrixState === "loading" ? "…" : "Отключить Bitrix"}
            </button>
          )}

          <div className="text-xs text-neutral-500">
            Если эндпоинтов Bitrix у тебя ещё нет — UI покажет 404, билд не сломается.
          </div>
        </div>

        <div className="mt-4 text-xs text-neutral-500">
          API:{" "}
          <span className="text-neutral-300">/api/integrations/bitrix/connect</span>{" "}
          · <span className="text-neutral-300">/api/integrations/bitrix/disconnect</span>
        </div>
      </Card>

      {/* Webhook */}
      <Card
        title="Webhook"
        subtitle="Универсальный вход для звонков (если не amo/bitrix)"
        right={statusBadge(!!webhook?.enabled)}
      >
        {webhookMsg && (
          <div className="mb-3">
            <Banner kind="ok" text={webhookMsg} />
          </div>
        )}
        {webhookErr && (
          <div className="mb-3">
            <Banner kind="error" text={webhookErr} />
          </div>
        )}

        <div className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
              <div className="text-xs text-neutral-400">Webhook URL</div>
              <div className="mt-1 break-all text-sm text-neutral-200">
                {webhookInfo?.url || "— (endpoint /info может быть не реализован)"}
              </div>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
              <div className="text-xs text-neutral-400">Secret</div>
              <div className="mt-1 break-all text-sm text-neutral-200">
                {webhookInfo?.secret || "— (секрет может не отдаваться намеренно)"}
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">
                В проде секрет обычно не показывают. Ротацию делаем через кнопку.
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={webhookRefreshInfo}
              disabled={webhookState === "loading"}
              className="rounded-md border border-neutral-700 bg-black px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-900 disabled:opacity-60"
            >
              {webhookState === "loading" ? "…" : "Refresh info"}
            </button>

            <button
              type="button"
              onClick={webhookRegenerateSecret}
              disabled={webhookState === "loading"}
              className="rounded-md border border-neutral-700 bg-black px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-900 disabled:opacity-60"
            >
              Rotate secret
            </button>

            <button
              type="button"
              onClick={webhookTest}
              disabled={webhookTestState === "loading"}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
            >
              {webhookTestState === "loading" ? "Testing…" : "Test webhook"}
            </button>
          </div>

          <div className="text-xs text-neutral-500">
            API: <span className="text-neutral-300">/api/integrations/webhook/info</span>{" "}
            · <span className="text-neutral-300">/api/integrations/webhook/rotate-secret</span>{" "}
            · <span className="text-neutral-300">/api/integrations/webhook/test</span>
          </div>
        </div>
      </Card>

      <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 text-xs text-neutral-400">
        <div className="text-neutral-200 font-medium">Операционная заметка</div>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>
            После connect/disconnect UI просит “обнови страницу” — потому что данные интеграций
            грузятся на серверной странице из DB.
          </li>
          <li>
            Если endpoint не реализован — UI покажет 404/ошибку, но сборка не должна падать.
          </li>
        </ul>
      </div>
    </div>
  );
}
