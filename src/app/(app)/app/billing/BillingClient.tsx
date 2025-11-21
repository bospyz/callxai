"use client";

import React from "react";
import { useSearchParams } from "next/navigation";

type BillingPlan = "start" | "pro" | "team";

export default function BillingPage() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status");

  const [loadingPlan, setLoadingPlan] = React.useState<BillingPlan | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleCheckout(plan: BillingPlan) {
    try {
      setError(null);
      setLoadingPlan(plan);

      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Checkout error");
      }

      const data = await res.json();

      if (data?.url) {
        window.location.href = data.url as string;
        return;
      }

      throw new Error("Stripe URL is missing in response");
    } catch (err: any) {
      console.error("[Billing] checkout error", err);
      setError(err?.message ?? "Ошибка при создании оплаты");
      setLoadingPlan(null);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white px-4 pb-10 pt-6">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-500">
              CALLX BILLING
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Тарифы и оплата</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Выбери тариф под свой отдел продаж и оплати картой.
            </p>
          </div>
        </header>

        {/* Статус из query (?status=success|cancel) */}
        {status === "success" && (
          <div className="rounded-2xl border border-emerald-500/50 bg-emerald-950/60 p-4 text-sm text-emerald-100">
            <div className="font-semibold mb-1">Оплата прошла успешно</div>
            <div>Подписка будет активирована для твоей компании.</div>
          </div>
        )}

        {status === "cancel" && (
          <div className="rounded-2xl border border-yellow-500/40 bg-yellow-950/60 p-4 text-sm text-yellow-100">
            <div className="font-semibold mb-1">Оплата отменена</div>
            <div>Ты можешь повторить оплату в любой момент.</div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/50 bg-red-950/60 p-4 text-sm text-red-100">
            <div className="font-semibold mb-1">Ошибка</div>
            <div>{error}</div>
          </div>
        )}

        {/* Карточки тарифов */}
        <section className="grid gap-4 md:grid-cols-3">
          <PlanCard
            name="START"
            price="19 000 "
            period="в месяц"
            description="Для теста CallX на одной небольшой команде."
            features={[
              "До 2 менеджеров",
              "До 2 000 звонков в месяц",
              "Базовый скоринг звонков",
              "Отчеты по компании",
            ]}
            actionLabel={
              loadingPlan === "start" ? "Готовим оплату..." : "Оплатить START"
            }
            disabled={loadingPlan !== null}
            highlighted={false}
            onClick={() => handleCheckout("start")}
          />

          <PlanCard
            name="PRO"
            price="49 000 "
            period="в месяц"
            description="Для активного отдела продаж, который хочет видеть качество звонков."
            features={[
              "До 5 менеджеров",
              "До 5 000 звонков в месяц",
              "Скоринг и комментарии ИИ",
              "Аналитика по компании и менеджерам",
            ]}
            actionLabel={
              loadingPlan === "pro" ? "Готовим оплату..." : "Оплатить PRO"
            }
            disabled={loadingPlan !== null}
            highlighted={true}
            onClick={() => handleCheckout("pro")}
          />

          <PlanCard
            name="TEAM"
            price="99 000 "
            period="в месяц"
            description="Для команд, где важно видеть разрез по каждому менеджеру и воронке."
            features={[
              "До 15 менеджеров",
              "До 15 000 звонков в месяц",
              "Глубокий скоринг и чек-листы",
              "Расширенная аналитика по менеджерам",
            ]}
            actionLabel={
              loadingPlan === "team" ? "Готовим оплату..." : "Оплатить TEAM"
            }
            disabled={loadingPlan !== null}
            highlighted={false}
            onClick={() => handleCheckout("team")}
          />
        </section>

        <section className="mt-4 text-[11px] text-neutral-500">
          Оплата проходит через Stripe. Карты VISA / MasterCard. После оплаты
          подписка привязывается к твоей компании в CallX.
        </section>
      </div>
    </main>
  );
}

type PlanCardProps = {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  actionLabel: string;
  disabled?: boolean;
  highlighted?: boolean;
  onClick: () => void;
};

function PlanCard(props: PlanCardProps) {
  const borderCls = props.highlighted
    ? "border-emerald-500/70 bg-emerald-950/40 shadow-[0_0_60px_rgba(16,185,129,0.35)]"
    : "border-neutral-800 bg-neutral-950/80";

  return (
    <div
      className={
        "relative flex h-full flex-col justify-between rounded-2xl border p-5 sm:p-6 " +
        borderCls
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{props.name}</h2>
          {props.highlighted && (
            <span className="rounded-full border border-emerald-400/70 bg-emerald-900/40 px-2 py-0.5 text-[10px] font-medium text-emerald-100">
              Популярный
            </span>
          )}
        </div>
        <p className="text-sm text-neutral-300">{props.description}</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-3xl font-semibold">{props.price}</span>
          <span className="text-xs text-neutral-500">{props.period}</span>
        </div>
        <ul className="mt-3 space-y-1.5 text-xs text-neutral-300">
          {props.features.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <span className="mt-[2px] h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        onClick={props.onClick}
        disabled={props.disabled}
        className={
          "mt-5 inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-medium transition-colors " +
          (props.highlighted
            ? "bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-60"
            : "bg-white text-black hover:bg-neutral-200 disabled:opacity-60")
        }
      >
        {props.actionLabel}
      </button>
    </div>
  );
}
