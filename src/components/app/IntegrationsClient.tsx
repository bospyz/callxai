"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";

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

// то же, что отдаёт /api/billing/quota
type QuotaResponse = {
  ok: boolean;
  companyId: string;
  plan: string; // FREE / START / PRO / ENTERPRISE
  hasActiveSub: boolean;
  reason:
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

export function IntegrationsClient({ amo, bitrix, webhook }: Props) {
  const [domain, setDomain] = useState<string>(
    (amo?.config?.domain as string) || ""
  );
  const [token, setToken] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Настройки импорта звонков (UI-состояние)
  const [skipShort, setSkipShort] = useState<boolean>(true);
  const [minDurationSec, setMinDurationSec] = useState<number>(30);
  const [limit, setLimit] = useState<number>(30);
  const [days, setDays] = useState<number>(7);

  // Квота по тарифу
  const [quota, setQuota] = useState<QuotaResponse | null>(null);

  const isConnected = !!amo?.enabled && !!amo?.config?.domain;

  useEffect(() => {
    async function loadQuota() {
      try {
        const res = await fetch("/api/billing/quota");
        if (!res.ok) return;
        const json = (await res.json()) as QuotaResponse;
        setQuota(json);
      } catch {
        // без квоты просто остаёмся на дефолтах, не ломаем UI
      }
    }
    loadQuota();
  }, []);

  const plan = quota?.plan ?? "FREE";
  const quotaLimit = typeof quota?.limit === "number" ? quota.limit : null;
  const quotaRemaining =
    typeof quota?.remaining === "number" ? quota.remaining : null;
  const billableMin = quota?.billableMinDurationSec ?? 30;

  // максимальный лимит для инпута (только из бэка)
  const maxLimitForInput =
    plan === "FREE"
      ? quotaLimit ?? 30
      : quotaLimit ?? quotaRemaining ?? 2000; // для платных, если бэк не ограничил, даём до 2000 за прогон

  // как только приехала квота — подстраиваем настройки
  useEffect(() => {
    if (!quota) return;

    // фиксируем минимальную боевую длительность
    setMinDurationSec(billableMin);

    if (plan === "FREE") {
      // FREE: ровно limit из бэка (например, 30)
      const base = quotaLimit ?? 30;
      setLimit(base);
    } else {
      // платные: дефолт = remaining, потом limit / руками
      const base =
        quotaRemaining ??
        quotaLimit ??
        Math.min(2000, maxLimitForInput || 2000);
      setLimit(base);
    }
  }, [quota, plan, billableMin, quotaLimit, quotaRemaining, maxLimitForInput]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSyncError(null);
    setSyncMessage(null);

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
          "Интеграция amoCRM подключена. Анализ звонков появится в разделах «Звонки» и «Аналитика»."
      );

      // открываем политику в новой вкладке
      if (typeof window !== "undefined") {
        window.open("/legal/privacy", "_blank");
      }
    } catch (err: any) {
      setError(err?.message || "Ошибка сети при подключении");
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncError(null);
    setSyncMessage(null);

    try {
      setSyncLoading(true);

      // жёстко завязываем лимит на то, что сказал бэк
      let safeLimit = limit;

      if (plan === "FREE") {
        // FREE: всегда ровно квота (например, 30), без свободы
        safeLimit = quotaLimit ?? 30;
      } else if (quotaRemaining !== null) {
        // платные: не выходим за remaining
        safeLimit = Math.min(limit, quotaRemaining);
      } else if (quotaLimit !== null) {
        // если remaining нет, но limit есть — не выходим за limit
        safeLimit = Math.min(limit, quotaLimit);
      }

      const body: any = {
        limit: safeLimit,
        days,
        skipShort,
      };

      // всегда используем минимальную «боевую» длительность по тарифу
      if (skipShort) {
        body.minDurationSec = billableMin;
      }

      const res = await fetch("/api/integrations/amocrm/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          data.error || "Не удалось синхронизировать звонки из amoCRM"
        );
      }

      const created =
        typeof data.created === "number" ? data.created : undefined;
      const skippedShort =
        typeof data.skippedShort === "number" ? data.skippedShort : undefined;

      let msg =
        data.message ||
        "Синхронизировали последние звонки из amoCRM и обновили базу.";

      if (created !== undefined) {
        msg += ` Импортировано: ${created}.`;
      }
      if (skipShort && skippedShort !== undefined) {
        msg += ` Пропущено коротких звонков (< ${billableMin} сек.): ${skippedShort}.`;
      }

      setSyncMessage(msg);
    } catch (err: any) {
      setSyncError(err?.message || "Ошибка при синхронизации звонков");
    } finally {
      setSyncLoading(false);
    }
  }

  return (
    // Широкий контейнер — адаптив под все
          <div className="w-full space-y-6">


      {/* Хедер интеграций */}
      <div className="border border-neutral-900/80 rounded-2xl bg-gradient-to-b from-black via-black to-neutral-950 px-5 sm:px-8 lg:px-10 pt-6 pb-4 w-full">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-neutral-500">
            <span className="h-1 w-5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
            <span>интеграции</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold text-neutral-50">
                Подключения для твоего отдела продаж
              </h1>
              <p className="text-sm text-neutral-400 max-w-xl">
                CALLX забирает записи звонков из CRM / телефонии, анализирует
                их и показывает живую картину по менеджерам. Здесь ты управляешь
                всеми интеграциями в одном месте.
              </p>
            </div>
            <div className="flex flex-col items-start sm:items-end text-xs text-neutral-500 gap-1">
              <span className="uppercase tracking-[0.18em] text-neutral-600">
                статус системы
              </span>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
                <span className="text-[11px] text-emerald-300">
                  CORE интеграции {isConnected ? "активны" : "готовы к запуску"}
                </span>
              </div>
              {quota && (
                <span className="text-[11px] text-neutral-500">
                  Тариф:{" "}
                  <span className="text-neutral-200 font-medium">
                    {plan.toUpperCase()}
                  </span>{" "}
                  · лимит{" "}
                  {quotaLimit !== null ? quotaLimit : "безлимит"} звонков ≥{" "}
                  {billableMin} сек.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Две колонки: слева amo, справа — «справка» и скоро-фичи */}
       <div className="w-full grid gap-5 lg:grid-cols-2 items-start">

        {/* ЛЕВАЯ КОЛОНКА — amoCRM + правила импорта */}
        <div className="space-y-5">
          <div className="relative rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 sm:p-5 shadow-[0_0_40px_rgba(15,23,42,0.85)] overflow-hidden w-full">
            <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-emerald-500/5 blur-3xl" />
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-[15px] font-medium text-neutral-50">
                    amoCRM
                  </h2>
                  <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-emerald-300">
                    рекомендуем
                  </span>
                </div>
                <div className="text-[12px] text-neutral-400">
                  Основная CRM для рынка Казахстана
                </div>
              </div>
              <div
                className={`px-3 py-1 rounded-full text-[11px] font-medium border ${
                  isConnected
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-neutral-800 bg-neutral-950 text-neutral-400"
                }`}
              >
                {isConnected
                  ? `Подключено (${amo?.config?.domain})`
                  : "Ожидает подключения"}
              </div>
            </div>

            <p className="text-[13px] text-neutral-300 mb-3">
              Подключи amoCRM: мы заберём записи звонков из сделок, расшифруем
              их и посчитаем качество менеджеров. Сначала тестовый запуск,
              потом — по подписке.
            </p>

            {error && (
              <div className="mb-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
                {error}
              </div>
            )}

            {message && (
              <div className="mb-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-200">
                {message}
              </div>
            )}

            {syncError && (
              <div className="mb-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
                {syncError}
              </div>
            )}

            {syncMessage && (
              <div className="mb-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-200">
                {syncMessage}
              </div>
            )}

            {/* Форма подключения amo */}
            <form onSubmit={onSubmit} className="space-y-3 mt-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                    домен amocrm
                  </label>
                  <input
                    className="w-full rounded-xl border border-neutral-800 bg-black/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-emerald-400 focus:outline-none focus:ring-0"
                    placeholder="example.amocrm.ru"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                    access token
                  </label>
                  <input
                    className="w-full rounded-xl border border-neutral-800 bg-black/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-emerald-400 focus:outline-none focus:ring-0"
                    placeholder="скопируй из настроек интеграции"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 text-black text-[13px] px-3.5 py-1.5 font-medium hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                  >
                    {loading ? "Подключаем..." : "Подключить amoCRM"}
                  </button>
                  <span className="text-[11px] text-neutral-500">
                    Мы не создаём сделки, только читаем звонки для анализа.
                  </span>
                </div>
                <span className="text-[10px] text-neutral-500">
                  Нажимая «Подключить amoCRM», ты принимаешь{" "}
                  <Link
                    href="/legal/privacy"
                    className="underline underline-offset-2 decoration-dotted text-neutral-300 hover:text-emerald-300"
                  >
                    политику конфиденциальности CALLX
                  </Link>
                  . Мы не воруем базы, не трогаем сделки и не рассылаем
                  спам-контакты.
                </span>
              </div>
            </form>

            {/* Правила импорта */}
            <div className="mt-4 pt-3 border-t border-neutral-800 space-y-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                правила импорта звонков
              </div>

              {quota && (
                <div className="text-[11px] text-neutral-500">
                  На тарифе{" "}
                  <span className="font-semibold text-neutral-200">
                    {plan.toUpperCase()}
                  </span>{" "}
                  считаем только звонки ≥{" "}
                  <span className="font-semibold text-neutral-200">
                    {billableMin} сек
                  </span>
                  . За один прогон подтянем{" "}
                  {plan === "FREE" ? "ровно" : "не больше"}{" "}
                  <span className="font-semibold text-neutral-200">
                    {maxLimitForInput}
                  </span>{" "}
                  таких звонков.
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3 text-[13px] text-neutral-200">
                <div className="space-y-1.5">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                    сколько звонков тянуть
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={maxLimitForInput || undefined}
                    disabled={plan === "FREE"}
                    className="w-full rounded-xl border border-neutral-800 bg-black/60 px-3 py-1.5 text-sm text-neutral-100 disabled:opacity-50 focus:border-emerald-400 focus:outline-none focus:ring-0"
                    value={limit}
                    onChange={(e) => {
                      if (plan === "FREE") return;
                      const v = Number(e.target.value);
                      if (Number.isNaN(v)) return;
                      const clamped = maxLimitForInput
                        ? Math.min(Math.max(v, 1), maxLimitForInput)
                        : Math.max(v, 1);
                      setLimit(clamped);
                    }}
                  />
                  <div className="text-[11px] text-neutral-500">
                    {plan === "FREE"
                      ? "Фикс: весь бесплатный лимит за прогон (из квоты)."
                      : `Не больше ${maxLimitForInput} звонков за прогон по текущему тарифу.`}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                    период, дней
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    className="w-full rounded-xl border border-neutral-800 bg-black/60 px-3 py-1.5 text-sm text-neutral-100 focus:border-emerald-400 focus:outline-none focus:ring-0"
                    value={days}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isNaN(v)) return;
                      setDays(Math.max(1, Math.min(v, 90)));
                    }}
                  />
                  <div className="text-[11px] text-neutral-500">
                    За какой период тянуть последние звонки
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      id="skipShort"
                      type="checkbox"
                      checked={skipShort}
                      onChange={(e) => setSkipShort(e.target.checked)}
                      className="h-4 w-4 rounded border-neutral-700 bg-black text-emerald-500 focus:ring-emerald-400"
                    />
                    <label
                      htmlFor="skipShort"
                      className="text-[12px] text-neutral-200"
                    >
                      Пропускать звонки короче N секунд
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={billableMin}
                      max={3600}
                      disabled={!skipShort}
                      className="w-24 rounded-xl border border-neutral-800 bg-black/60 px-3 py-1.5 text-sm text-neutral-100 disabled:opacity-40 focus:border-emerald-400 focus:outline-none focus:ring-0"
                      value={minDurationSec}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isNaN(v)) return;
                        setMinDurationSec(
                          Math.max(billableMin, Math.min(v, 3600))
                        );
                      }}
                    />
                    <span className="text-[11px] text-neutral-500">
                      Меньше {billableMin} сек по тарифу всё равно не считаем
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSync}
                  disabled={syncLoading}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/70 bg-emerald-500/10 px-3.5 py-1.5 text-[13px] text-emerald-200 hover:bg-emerald-500/20 hover:text-white disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {syncLoading
                    ? "Синхронизируем звонки..."
                    : "Синхронизировать звонки из amoCRM"}
                </button>
                <span className="text-[11px] text-neutral-500">
                  Тянем только «боевые» звонки ≥ {billableMin} сек и не выходим
                  за лимит тарифа.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ПРАВАЯ КОЛОНКА — чек-лист, «скоро» и поддержка */}
        <div className="space-y-4">
          {/* Чек-лист подключения */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 sm:p-5 shadow-[0_0_40px_rgba(15,23,42,0.75)]">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-600">
                  чек-лист внедрения
                </div>
                <div className="text-sm text-neutral-200">
                  Как подключить CALLX за 15 минут
                </div>
              </div>
              <div className="h-8 w-8 rounded-2xl border border-emerald-400/50 bg-emerald-500/10 flex items-center justify-center text-[11px] text-emerald-300">
                CX
              </div>
            </div>
            <ul className="space-y-2.5 text-[13px] text-neutral-300">
              <ChecklistItem
                step={1}
                text="Выбери CRM (amoCRM сейчас) или формат телефонии, с которой будем забирать записи."
              />
              <ChecklistItem
                step={2}
                text="Подключи amoCRM через домен и access token или оставь заявку на телефонию / SIP."
              />
              <ChecklistItem
                step={3}
                text='Запусти импорт звонков и дождись статуса DONE, потом зайди в раздел «Звонки».'
              />
              <ChecklistItem
                step={4}
                text="Открой аналитику, найди слабых менеджеров и зафиксируй план роста."
              />
            </ul>
          </div>

          {/* Телефония / SIP — скоро */}
          <IntegrationCard
            label="Телефония / SIP"
            subtitle="Через провайдера или Asterisk"
            description="Подключи свою телефонию или Asterisk-сервер, чтобы мы забирали записи звонков напрямую, минуя CRM. Модуль уже в разработке."
            badge="скоро"
            status={false}
            disabled
            onToggle={() => {}}
            actions={[{ label: "Оставить заявку", primary: true }]}
          />

          {/* Ручная загрузка — скоро */}
          <IntegrationCard
            label="Ручная загрузка записей"
            subtitle="Для старта без интеграций"
            description="Если CRM ещё не настроена, скоро можно будет просто загружать файлы разговоров — CALLX всё равно посчитает качество менеджеров."
            badge="скоро"
            status={false}
            disabled
            onToggle={() => {}}
            actions={[{ label: "Загрузить записи (скоро)", primary: true }]}
          />

          {/* Поддержка */}
          <div className="rounded-2xl border border-neutral-800 bg-gradient-to-br from-emerald-500/18 via-emerald-500/7 to-transparent p-4 sm:p-5">
            <div className="text-[11px] uppercase tracking-[0.22em] text-emerald-300 mb-1">
              поддержка
            </div>
            <div className="text-sm text-neutral-100 mb-2">
              Нужна помощь с интеграцией?
            </div>
            <p className="text-[13px] text-neutral-300 mb-3">
              Напиши нам в Telegram — подключим CALLX к твоей CRM и телефонии
              аккуратно, без остановки работы отдела продаж.
            </p>
            <button className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/60 bg-emerald-500/10 px-3.5 py-1.5 text-[13px] text-emerald-200 hover:bg-emerald-500/20 hover:text-white transition-all duration-200">
              <span>Написать в Telegram</span>
              <span className="text-xs">↗</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ ===== */

type IntegrationCardProps = {
  label: string;
  subtitle: string;
  description: string;
  badge?: string;
  status: boolean;
  disabled?: boolean;
  onToggle: () => void;
  actions?: { label: string; primary?: boolean }[];
};

function IntegrationCard({
  label,
  subtitle,
  description,
  badge,
  status,
  disabled,
  onToggle,
  actions = [],
}: IntegrationCardProps) {
  const isOn = status;

  return (
    <div className="relative rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 sm:p-5 shadow-[0_0_40px_rgba(15,23,42,0.85)] overflow-hidden w-full">
      <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-emerald-500/5 blur-3xl" />
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-[15px] font-medium text-neutral-50">
              {label}
            </h2>
            {badge && (
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-emerald-300">
                {badge}
              </span>
            )}
          </div>
          <div className="text-[12px] text-neutral-400">{subtitle}</div>
        </div>
        <button
          type="button"
          onClick={disabled ? undefined : onToggle}
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] transition-all ${
            disabled
              ? "border-neutral-800 text-neutral-600 cursor-not-allowed"
              : isOn
              ? "border-emerald-400 bg-emerald-500/10 text-emerald-300 shadow-[0_0_14px_rgba(52,211,153,0.7)]"
              : "border-neutral-700 text-neutral-400 hover:border-emerald-300 hover:text-emerald-200"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              disabled ? "bg-neutral-600" : isOn ? "bg-emerald-400" : "bg-neutral-600"
            }`}
          />
          <span>{disabled ? "скоро" : isOn ? "включено" : "выключено"}</span>
        </button>
      </div>
      <p className="text-[13px] text-neutral-300 mb-3">{description}</p>
      {actions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {actions.map((action, idx) => (
            <button
              key={idx}
              type="button"
              className={
                action.primary
                  ? "inline-flex items-center gap-1 rounded-xl bg-emerald-500 text-black text-[13px] px-3.5 py-1.5 font-medium hover:bg-emerald-400 transition-all"
                  : "inline-flex items-center gap-1 rounded-xl border border-neutral-700 text-[13px] text-neutral-300 px-3 py-1.5 hover:border-neutral-500 hover:text-white transition-all"
              }
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChecklistItem({ step, text }: { step: number; text: string }) {
  return (
    <li className="flex gap-3">
      <div className="mt-0.5 h-5 w-5 flex items-center justify-center rounded-full border border-neutral-700 text-[11px] text-neutral-300">
        {step}
      </div>
      <p>{text}</p>
    </li>
  );
}
