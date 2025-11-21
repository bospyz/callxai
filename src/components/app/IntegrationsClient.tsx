"use client";

import { useState, FormEvent } from "react";

type Integration = {
  id: string;
  type: string;
  enabled: boolean;
  config: any | null;
} | null;

interface Props {
  amo: Integration;
  bitrix: Integration;
  webhook: Integration;
}

export function IntegrationsClient({ amo, bitrix, webhook }: Props) {
  const [domain, setDomain] = useState<string>(
    (amo?.config?.domain as string) || ""
  );
  const [token, setToken] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isConnected = !!amo?.enabled && !!amo?.config?.domain;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!domain || !token) {
      setError("Укажи домен и access token amoCRM");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch("/api/integrations/amocrm/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          accessToken: token,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          data.error ||
            "Не удалось подключить amoCRM. Проверь домен и access token."
        );
        return;
      }

      setMessage(
        data.message ||
          "Интеграция amoCRM подключена. Анализ звонков появится в разделе Звонки и Аналитика."
      );
    } catch (err: any) {
      setError(err.message || "Ошибка сети при подключении");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Блок amoCRM */}
      <div className="border border-neutral-900 rounded-2xl p-6 bg-black/40 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-50">
              amoCRM
            </h2>
            <p className="text-xs text-neutral-500">
              Подключи amoCRM: мы возьмём записи звонков, расшифруем и
              проанализируем. Бесплатно один пробный запуск по этому домену,
              дальше  по подписке.
            </p>
          </div>
          <div
            className={`px-3 py-1 rounded-full text-xs font-medium border ${
              isConnected
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-neutral-800 bg-neutral-900 text-neutral-400"
            }`}
          >
            {isConnected
              ? `Подключено (${amo?.config?.domain})`
              : "Не подключено"}
          </div>
        </div>

        <div className="text-[11px] text-neutral-500 space-y-1">
          <p>Мы храним только ссылки на записи, сами файлы остаются у тебя.</p>
          <p>
            После подключения первый анализ запускается сразу, затем каждые 30
            минут через cron.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="mt-4 grid gap-3 md:grid-cols-[2fr_2fr_auto]"
        >
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-neutral-500">
              Домен amoCRM
            </label>
            <input
              className="px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-xs text-neutral-100 outline-none focus:border-emerald-500/70"
              placeholder="example.amocrm.ru"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-neutral-500">
              Access token amoCRM
            </label>
            <input
              className="px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-xs text-neutral-100 outline-none focus:border-emerald-500/70"
              placeholder="Вставь настоящий access_token из amoCRM (не секретный ключ и не код авторизации)"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <p className="text-[10px] text-neutral-500 mt-1 leading-snug">
              Где взять access token:{" "}
              <span className="text-neutral-300">
                Настройки  Интеграции  твоя интеграция (CallAnalysis) 
                раздел OAuth / API. Нужен именно <b>access_token</b>, а не
                секретный ключ и не код авторизации на 20 минут.
              </span>
            </p>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="w-full md:w-auto px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {loading ? "Подключаем..." : isConnected ? "Обновить" : "Подключить"}
            </button>
          </div>
        </form>

        {(message || error) && (
          <div className="mt-3 text-xs">
            {message && (
              <div className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2">
                {message}
              </div>
            )}
            {error && (
              <div className="text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bitrix и Webhook блоки-заглушки, чтобы не ломать общий UX */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="border border-neutral-900 rounded-2xl p-4 bg-black/30 text-xs text-neutral-500">
          <div className="text-sm font-semibold text-neutral-200 mb-1">
            Bitrix24 (скоро)
          </div>
          <p>Здесь будет подключение Bitrix24.</p>
        </div>
        <div className="border border-neutral-900 rounded-2xl p-4 bg-black/30 text-xs text-neutral-500">
          <div className="text-sm font-semibold text-neutral-200 mb-1">
            Webhook / кастом (скоро)
          </div>
          <p>Для своих АТС и CRM через вебхуки.</p>
        </div>
      </div>
    </div>
  );
}
