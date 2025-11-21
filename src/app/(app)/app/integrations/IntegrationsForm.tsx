"use client";

import { useState } from "react";

type AmoConfig = {
  domain?: string;
  token?: string;
};

type BitrixConfig = {
  domain?: string;
  webhook?: string;
};

type WebhookConfig = {
  url?: string;
};

type Props = {
  initial: {
    amo: AmoConfig;
    amoEnabled: boolean;
    bitrix: BitrixConfig;
    bitrixEnabled: boolean;
    webhook: WebhookConfig;
    webhookEnabled: boolean;
  };
};

type SavePayload =
  | { type: "AMOCRM"; enabled: boolean; config: AmoConfig }
  | { type: "BITRIX24"; enabled: boolean; config: BitrixConfig }
  | { type: "WEBHOOK"; enabled: boolean; config: WebhookConfig };

async function saveIntegration(payload: SavePayload): Promise<void> {
  const res = await fetch("/api/integrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Ошибка сохранения");
  }
}

export default function IntegrationsForm({ initial }: Props) {
  // AmoCRM
  const [amoEnabled, setAmoEnabled] = useState(initial.amoEnabled);
  const [amoDomain, setAmoDomain] = useState(initial.amo.domain ?? "");
  const [amoToken, setAmoToken] = useState(initial.amo.token ?? "");

  // Bitrix24
  const [bitrixEnabled, setBitrixEnabled] = useState(initial.bitrixEnabled);
  const [bitrixDomain, setBitrixDomain] = useState(initial.bitrix.domain ?? "");
  const [bitrixWebhook, setBitrixWebhook] = useState(
    initial.bitrix.webhook ?? ""
  );

  // Webhook
  const [webhookEnabled, setWebhookEnabled] = useState(
    initial.webhookEnabled
  );
  const [webhookUrl, setWebhookUrl] = useState(initial.webhook.url ?? "");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave(type: "AMOCRM" | "BITRIX24" | "WEBHOOK") {
    try {
      setLoading(true);
      setMsg(null);
      setErr(null);

      let payload: SavePayload;

      if (type === "AMOCRM") {
        payload = {
          type: "AMOCRM",
          enabled: amoEnabled,
          config: {
            domain: amoDomain || undefined,
            token: amoToken || undefined,
          },
        };
      } else if (type === "BITRIX24") {
        payload = {
          type: "BITRIX24",
          enabled: bitrixEnabled,
          config: {
            domain: bitrixDomain || undefined,
            webhook: bitrixWebhook || undefined,
          },
        };
      } else {
        payload = {
          type: "WEBHOOK",
          enabled: webhookEnabled,
          config: {
            url: webhookUrl || undefined,
          },
        };
      }

      await saveIntegration(payload);
      setMsg("Сохранено");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Ошибка сохранения";
      setErr(message);
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(null), 2000);
    }
  }

  return (
    <div className="space-y-5 text-sm text-neutral-200">
      {/* AmoCRM */}
      <div className="border border-neutral-900 bg-neutral-950 rounded-3xl p-5 space-y-3">
        <div className="flex justify-between items-center gap-3">
          <div>
            <div className="text-sm font-semibold">AmoCRM</div>
            <div className="text-[11px] text-neutral-500">
              Введите домен и API-ключ AmoCRM для синхронизации лидов и звонков.
            </div>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-neutral-400">
            <input
              type="checkbox"
              checked={amoEnabled}
              onChange={(e) => setAmoEnabled(e.target.checked)}
              className="w-3 h-3 accent-emerald-400"
            />
            Включено
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-[10px] text-neutral-500 mb-1">Домен</div>
            <input
              value={amoDomain}
              onChange={(e) => setAmoDomain(e.target.value)}
              placeholder="example.amocrm.ru"
              className="w-full bg-black border border-neutral-800 rounded-xl px-3 py-2 text-[12px] outline-none focus:border-emerald-400"
            />
          </div>
          <div>
            <div className="text-[10px] text-neutral-500 mb-1">API token</div>
            <input
              value={amoToken}
              onChange={(e) => setAmoToken(e.target.value)}
              placeholder="Секретный ключ AmoCRM"
              className="w-full bg-black border border-neutral-800 rounded-xl px-3 py-2 text-[12px] outline-none focus:border-emerald-400"
            />
          </div>
        </div>
        <button
          onClick={() => handleSave("AMOCRM")}
          disabled={loading}
          className="mt-2 px-4 py-2 rounded-xl bg-emerald-400 text-black text-[12px] hover:bg-emerald-300 transition disabled:opacity-60"
        >
          Сохранить AmoCRM
        </button>
      </div>

      {/* Bitrix24 */}
      <div className="border border-neutral-900 bg-neutral-950 rounded-3xl p-5 space-y-3">
        <div className="flex justify-between items-center gap-3">
          <div>
            <div className="text-sm font-semibold">Bitrix24</div>
            <div className="text-[11px] text-neutral-500">
              Укажите домен и webhook URL для обмена данными.
            </div>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-neutral-400">
            <input
              type="checkbox"
              checked={bitrixEnabled}
              onChange={(e) => setBitrixEnabled(e.target.checked)}
              className="w-3 h-3 accent-emerald-400"
            />
            Включено
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-[10px] text-neutral-500 mb-1">Домен</div>
            <input
              value={bitrixDomain}
              onChange={(e) => setBitrixDomain(e.target.value)}
              placeholder="example.bitrix24.ru"
              className="w-full bg-black border border-neutral-800 rounded-xl px-3 py-2 text-[12px] outline-none focus:border-emerald-400"
            />
          </div>
          <div>
            <div className="text-[10px] text-neutral-500 mb-1">Webhook URL</div>
            <input
              value={bitrixWebhook}
              onChange={(e) => setBitrixWebhook(e.target.value)}
              placeholder="https://example.bitrix24.ru/rest/..."
              className="w-full bg-black border border-neutral-800 rounded-xl px-3 py-2 text-[12px] outline-none focus:border-emerald-400"
            />
          </div>
        </div>
        <button
          onClick={() => handleSave("BITRIX24")}
          disabled={loading}
          className="mt-2 px-4 py-2 rounded-xl bg-emerald-400 text-black text-[12px] hover:bg-emerald-300 transition disabled:opacity-60"
        >
          Сохранить Bitrix24
        </button>
      </div>

      {/* Webhook */}
      <div className="border border-neutral-900 bg-neutral-950 rounded-3xl p-5 space-y-3">
        <div className="flex justify-between items-center gap-3">
          <div>
            <div className="text-sm font-semibold">Webhook</div>
            <div className="text-[11px] text-neutral-500">
              URL, на который CallXAI будет отправлять события и результаты анализа.
            </div>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-neutral-400">
            <input
              type="checkbox"
              checked={webhookEnabled}
              onChange={(e) => setWebhookEnabled(e.target.checked)}
              className="w-3 h-3 accent-emerald-400"
            />
            Включено
          </label>
        </div>
        <div>
          <div className="text-[10px] text-neutral-500 mb-1">Webhook URL</div>
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://your-system.com/callxai-webhook"
            className="w-full bg-black border border-neutral-800 rounded-xl px-3 py-2 text-[12px] outline-none focus:border-emerald-400"
          />
        </div>
        <button
          onClick={() => handleSave("WEBHOOK")}
          disabled={loading}
          className="mt-2 px-4 py-2 rounded-xl bg-emerald-400 text-black text-[12px] hover:bg-emerald-300 transition disabled:opacity-60"
        >
          Сохранить Webhook
        </button>
      </div>

      {msg && <div className="text-[11px] text-emerald-400">{msg}</div>}
      {err && <div className="text-[11px] text-red-400">{err}</div>}
    </div>
  );
}
