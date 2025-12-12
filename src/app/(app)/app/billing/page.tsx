// src/app/(app)/app/billing/page.tsx

"use client";

import React from "react";

type BillingPlanId = "free" | "start" | "enterprise";

type BillingPlan = {
  id: BillingPlanId;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
};

// тарифы для заявки (витрина)
const PLANS: BillingPlan[] = [
  {
    id: "free",
    name: "FREE",
    price: "0 ₸",
    period: "для старта",
    description: "Чтобы спокойно протестировать CallX на своём отделе.",
    features: [
      "До 30 звонков в месяц ≥ 30 сек",
      "1 компания в CallX",
      "Базовый скоринг звонков",
      "Дашборд по звонкам",
    ],
    badge: "Стартовый",
  },
  {
    id: "start",
    name: "START",
    price: "49 990 ₸",          // ← новая цена      // ← старая цена, будет зачёркнута
    period: "в месяц",
    description:
      "Когда фри-лимита уже мало и нужно смотреть на отдел по-взрослому.",
    features: [
      "До 2 000 звонков в месяц ≥ 30 сек",
      "До 3 менеджеров",
      "Скоринг и разбор звонков ИИ",
      "Отчёты по компании и менеджерам",
    ],
    highlighted: true,
    badge: "Оптимальный",
  },
  {
    id: "enterprise",
    name: "ENTERPRISE",
    price: "Enterprise",
    period: "по договорённости",
    description:
      "Для крупных застройщиков, банков и сетей с большим потоком звонков.",
    features: [
      "Без ограничений по звонкам ≥ 30 сек",
      "Гибкое количество менеджеров",
      "Кастомные отчёты и интеграции",
      "Приоритетная поддержка и SLA",
    ],
  },
];

// реальные планы из квоты
type PlanKey = "free" | "start" | "pro" | "enterprise";

type CallsQuota = {
  plan: PlanKey;
  limit: number | null; // null = безлимит
  used: number;
  remaining: number | null;
};

type QuotaApiResponse = {
  ok: boolean;
  quota: CallsQuota;
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getNextResetAt(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toISOString();
}

function getPlanLabel(plan: PlanKey): string {
  switch (plan) {
    case "free":
      return "FREE";
    case "start":
      return "START";
    case "pro":
      return "PRO";
    case "enterprise":
      return "ENTERPRISE";
    default: {
      // на случай расширения union-типа в будущем
      const fallback = plan as string;
      return fallback.toUpperCase();
    }
  }
}


function getPlanDescription(plan: PlanKey): string {
  switch (plan) {
    case "free":
      return "Демо-режим: до 30 боевых звонков в месяц (≥ 30 сек).";
    case "start":
      return "Стартовый тариф: до 2 000 звонков в месяц для отдела.";
    case "pro":
      return "PRO: до 5 000 звонков в месяц и расширенная аналитика.";
    case "enterprise":
      return "Enterprise: безлимитный анализ звонков и кастомные условия.";
    default:
      return "";
  }
}

function getUsagePercent(quota: CallsQuota): number {
  if (quota.limit == null || quota.limit <= 0) return 0;
  const used = Math.max(0, quota.used);
  return Math.min(100, Math.round((used * 100) / quota.limit));
}

export default function BillingPage() {
  const [selectedPlan, setSelectedPlan] =
    React.useState<BillingPlanId>("start");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  // квота из /api/billing/quota
  const [quota, setQuota] = React.useState<CallsQuota | null>(null);
  const [quotaLoading, setQuotaLoading] = React.useState(false);
  const [quotaError, setQuotaError] = React.useState<string | null>(null);

  async function fetchQuota() {
    try {
      setQuotaLoading(true);
      setQuotaError(null);

      const res = await fetch("/api/billing/quota", { method: "GET" });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed: ${res.status}`);
      }

      const json = (await res.json()) as QuotaApiResponse;

      if (!json.ok || !json.quota) {
        throw new Error("Некорректный ответ от /api/billing/quota");
      }

      setQuota(json.quota);
    } catch (err: any) {
      console.error("[Billing] quota error", err);
      setQuotaError(err?.message ?? "Не удалось загрузить квоту");
    } finally {
      setQuotaLoading(false);
    }
  }

  React.useEffect(() => {
    void fetchQuota();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const formData = new FormData(e.currentTarget);
    const payload = {
      plan: formData.get("plan") as BillingPlanId,
      fullName: String(formData.get("fullName") || "").trim(),
      companyName: String(formData.get("companyName") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      billingDetails: String(formData.get("billingDetails") || "").trim(),
      comment: String(formData.get("comment") || "").trim(),
    };

    if (!payload.fullName || !payload.phone || !payload.companyName) {
      setError("Заполни ФИО, компанию и телефон — без этого счёт не выставим.");
      return;
    }

    try {
      setSubmitting(true);

      const res = await fetch("/api/billing/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Не удалось отправить заявку");
      }

      setSuccess(
        "Заявка отправлена. Мы напишем тебе в WhatsApp / позвоним, выставим счёт и подключим тариф."
      );
      (e.target as HTMLFormElement).reset();
    } catch (err: any) {
      console.error("[Billing] request error", err);
      setError(err?.message ?? "Ошибка при отправке заявки");
    } finally {
      setSubmitting(false);
    }
  }

  const activePlan = PLANS.find((p) => p.id === selectedPlan) ?? PLANS[1];
  const usagePercent = quota ? getUsagePercent(quota) : 0;
  const nextResetAt = getNextResetAt();

  return (
<main className="min-h-screen w-full bg-black text-neutral-50">
  <div className="w-full px-4 sm:px-8 lg:px-12 xl:px-16 pb-12 pt-8 space-y-8">
        {/* HEADER */}
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950/95 px-3.5 py-1.5 text-[11px] text-neutral-400 shadow-[0_0_22px_rgba(34,197,94,0.35)]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>CALLX · Тарифы для Казахстана</span>
              <span className="hidden sm:inline text-[10px] text-neutral-500">
                фри-лимит, 2 000 звонков и Enterprise — как тебе удобнее
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight">
              Тарифы и подключение
            </h1>
            <p className="max-w-xl text-sm text-neutral-400">
              Выбери тариф, оставь контакты — дальше мы всё сделаем сами:
              выставим счёт, отошлём Kaspi и подключим отдел к CallX.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/90 px-4 py-3 text-[11px] text-neutral-400 max-w-xs">
            <p className="text-neutral-300 font-medium mb-1">
              Как это работает:
            </p>
            <ul className="space-y-1">
              <li>1️⃣ Выбираешь тариф и заполняешь форму.</li>
              <li>2️⃣ Мы пишем в WhatsApp или звоним.</li>
              <li>3️⃣ Выставляем счёт / Kaspi на твой номер / реквизиты.</li>
              <li>4️⃣ Подключаем тариф к твоей компании в CallX.</li>
            </ul>
          </div>
        </header>

        {/* ОШИБКА / УСПЕХ ЗАЯВКИ */}
        <div className="space-y-3">
          {success && (
            <div className="rounded-2xl border border-emerald-500/50 bg-emerald-950/60 px-4 py-3 text-sm text-emerald-100">
              <div className="font-semibold mb-1">Заявка отправлена</div>
              <div>{success}</div>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-red-500/50 bg-red-950/60 px-4 py-3 text-sm text-red-100">
              <div className="font-semibold mb-1">Ошибка</div>
              <div>{error}</div>
            </div>
          )}
        </div>

        {/* ТЕКУЩИЙ ТАРИФ И КВОТА */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">
            Текущий тариф и квота
          </h2>

          <div className="grid gap-4 md:grid-cols-[2fr,3fr]">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/90 p-4 sm:p-5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-neutral-500">
                    План компании
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {quota ? getPlanLabel(quota.plan) : "—"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchQuota}
                  disabled={quotaLoading}
                  className="inline-flex items-center rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-100 hover:bg-neutral-800 disabled:opacity-50"
                >
                  {quotaLoading ? "Обновляем…" : "Обновить квоту"}
                </button>
              </div>

              <p className="mt-2 text-xs text-neutral-400">
                {quota
                  ? getPlanDescription(quota.plan)
                  : "Подтягиваем данные по твоему тарифу и лимиту звонков…"}
              </p>

              <div className="mt-3 space-y-1 text-xs text-neutral-400">
                <div className="flex justify-between">
                  <span>Период биллинга:</span>
                  <span>1 календарный месяц</span>
                </div>
                <div className="flex justify-between">
                  <span>Сброс лимита:</span>
                  <span>{formatDate(nextResetAt)}</span>
                </div>
              </div>

              {quotaError && (
                <p className="mt-2 text-[11px] text-red-400">
                  Ошибка загрузки квоты: {quotaError}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/90 p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-neutral-500">
                    Лимит звонков ≥ 30 сек в месяц
                  </p>
                  <p className="mt-1 text-base font-semibold">
                    {quota
                      ? quota.limit == null
                        ? "Без лимита"
                        : `${quota.used} / ${quota.limit} звонков`
                      : "—"}
                  </p>
                </div>
                {quota && quota.limit != null && (
                  <p className="text-xs text-neutral-500">
                    Осталось:{" "}
                    <span className="text-neutral-100">
                      {quota.remaining ?? 0}
                    </span>
                  </p>
                )}
              </div>

              {quota && quota.limit != null && (
                <>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-900">
                    <div
                      className={`h-full rounded-full ${
                        usagePercent < 70
                          ? "bg-emerald-500"
                          : usagePercent < 90
                          ? "bg-amber-400"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-neutral-500">
                    <span>Использовано: {usagePercent}%</span>
                    <span>
                      {quota.remaining != null && quota.remaining <= 0
                        ? "Лимит исчерпан"
                        : quota.remaining != null && quota.remaining < 30
                        ? "Мало остатка — можно апгрейднуть тариф"
                        : "В пределах лимита"}
                    </span>
                  </div>
                </>
              )}

              {quota && quota.limit === null && (
                <p className="text-xs text-neutral-400">
                  На тарифе ENTERPRISE лимит звонков не ограничен. Все звонки
                  длительностью ≥ 30 секунд попадают в аналитику и отчёты.
                </p>
              )}

              {!quota && !quotaError && (
                <p className="text-xs text-neutral-500">
                  Загружаем данные по квоте… Если что-то пойдёт не так, можно
                  обновить блок кнопкой выше.
                </p>
              )}
            </div>
          </div>

          <p className="text-[11px] text-neutral-500">
            В квоту считаются только боевые звонки длительностью{" "}
            <span className="font-semibold text-neutral-300">≥ 30 секунд</span>.
            Короткие тестовые набора лучше делать с отдельного номера, чтобы не
            сжигать лимит.
          </p>
        </section>

        {/* ТАРИФЫ (ВИТРИНА) */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">
            1. Выбери тариф
          </h2>

          <div className="grid gap-4 md:grid-cols-3">
            {PLANS.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isSelected={selectedPlan === plan.id}
                onSelect={() => setSelectedPlan(plan.id)}
              />
            ))}
          </div>
        </section>

        {/* ФОРМА ЗАЯВКИ */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">
            2. Оставь данные для выставления счёта
          </h2>

          <div className="rounded-3xl border border-neutral-900 bg-neutral-950/95 px-4 py-5 sm:px-6 sm:py-6 shadow-[0_22px_70px_rgba(0,0,0,0.95)]">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs text-neutral-400 mb-1">
                  Сейчас выбран тариф:
                </p>
                <p className="text-sm font-medium text-neutral-50">
                  {activePlan.name} · {activePlan.price}{" "}
                  <span className="text-[11px] text-neutral-500">
                    ({activePlan.period})
                  </span>
                </p>
              </div>
              <p className="text-[11px] text-neutral-500 max-w-sm">
                Укажи, на какой номер счёта / Kaspi / реквизиты нужно выставить
                оплату. Мы подтвердим всё в WhatsApp перед списанием.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              <input type="hidden" name="plan" value={selectedPlan} />

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-neutral-400">
                  ФИО / контактное лицо*
                </label>
                <input
                  name="fullName"
                  placeholder="Например: Иванов Иван Иванович"
                  className="h-9 rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-neutral-400">
                  Компания / проект*
                </label>
                <input
                  name="companyName"
                  placeholder="Например: CallX"
                  className="h-9 rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-neutral-400">
                  Телефон / WhatsApp*
                </label>
                <input
                  name="phone"
                  placeholder="+7 7xx xxx xx xx"
                  className="h-9 rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-neutral-400">
                  Email (по желанию)
                </label>
                <input
                  name="email"
                  type="email"
                  placeholder="sales@company.kz"
                  className="h-9 rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="lg:col-span-2 flex flex-col gap-1">
                <label className="text-[11px] text-neutral-400">
                  На какой номер счёта / Kaspi выставить?*
                </label>
                <input
                  name="billingDetails"
                  placeholder="Например: Kaspi Gold +7 7xx..., счёт ТОО KZxx..., БИН 123456789012"
                  className="h-9 rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="lg:col-span-3 flex flex-col gap-1">
                <label className="text-[11px] text-neutral-400">
                  Комментарий (по желанию)
                </label>
                <input
                  name="comment"
                  placeholder="Удобное время звонка, формат оплаты, доп. вопросы"
                  className="h-9 rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="mt-2 flex items-center gap-3 sm:col-span-2 lg:col-span-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-6 py-2 text-sm font-semibold text-black shadow-[0_0_22px_rgba(74,222,128,0.6)] hover:brightness-105 transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? "Отправляем заявку…" : "Отправить заявку"}
                </button>
                <p className="text-[11px] text-neutral-500">
                  После заявки мы напишем тебе в WhatsApp, согласуем оплату и
                  подключим тариф вручную.
                </p>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

/* ===== КАРТОЧКА ТАРИФА ===== */

function PlanCard({
  plan,
  isSelected,
  onSelect,
}: {
  plan: BillingPlan;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const borderCls = plan.highlighted
    ? "border-emerald-500/70 bg-emerald-950/40 shadow-[0_0_60px_rgba(16,185,129,0.35)]"
    : "border-neutral-800 bg-neutral-950/80";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        "relative flex h-full w-full flex-col justify-between rounded-2xl border p-5 sm:p-6 text-left transition-transform hover:-translate-y-1 " +
        borderCls +
        (isSelected ? " ring-2 ring-emerald-400/70" : "")
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{plan.name}</h2>
          <div className="flex items-center gap-1">
            {plan.badge && (
              <span className="rounded-full border border-emerald-400/70 bg-emerald-900/40 px-2 py-0.5 text-[10px] font-medium text-emerald-100">
                {plan.badge}
              </span>
            )}
            {isSelected && (
              <span className="rounded-full bg-emerald-400/90 px-2 py-0.5 text-[10px] font-medium text-black">
                Выбран
              </span>
            )}
          </div>
        </div>
        <p className="text-sm text-neutral-300">{plan.description}</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-3xl font-semibold">{plan.price}</span>
          <span className="text-xs text-neutral-500">{plan.period}</span>
        </div>
        <ul className="mt-3 space-y-1.5 text-xs text-neutral-300">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <span className="mt-[2px] h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 inline-flex items-center justify-center rounded-full bg-neutral-100/10 px-4 py-1.5 text-[11px] font-medium text-neutral-100">
        {isSelected ? "Этот тариф выбран" : "Выбрать этот тариф"}
      </div>
    </button>
  );
}
