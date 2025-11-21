"use client";

import React from "react";

type CompanyAnalytics = {
  totalCalls: number;
  doneCalls: number;
  errorCalls: number;
  processingCalls: number;
  avgScore: number | null;
};

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = React.useState<CompanyAnalytics | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/analytics/summary?days=30");
        if (!res.ok) {
          throw new Error("Failed to load analytics");
        }

        const data = await res.json();
        setAnalytics(data.analytics ?? null);
      } catch (err: any) {
        console.error("[Analytics] load error", err);
        setError(err?.message ?? "Ошибка загрузки аналитики");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <main className="min-h-screen bg-black text-white px-4 pb-10 pt-6">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-500">
              CALLX ANALYTICS
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Аналитика по звонкам</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Сводка по звонкам компании за последние 30 дней.
            </p>
          </div>
        </header>

        {loading && (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-6 text-sm text-neutral-300">
            Загружаем аналитику
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/60 p-4 text-sm text-red-100">
            <div className="font-semibold mb-1">Ошибка</div>
            <div>{error}</div>
          </div>
        )}

        {!loading && !error && analytics && (
          <>
            {/* Карточки метрик */}
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Всего звонков"
                value={analytics.totalCalls}
                hint="Все за 30 дней"
              />
              <MetricCard
                label="Обработано (DONE)"
                value={analytics.doneCalls}
                hint="Успешно проанализировано"
              />
              <MetricCard
                label="В очереди/анализе"
                value={analytics.processingCalls}
                hint="NEW + PROCESSING"
              />
              <MetricCard
                label="Ошибки"
                value={analytics.errorCalls}
                hint="Нужно проверить аудио / интеграцию"
              />
            </section>

            {/* Средний скор + комментарий */}
            <section className="grid gap-4 lg:grid-cols-[1.2fr,1fr]">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-5">
                <h2 className="text-sm font-medium text-neutral-100 mb-2">
                  Средний скоринг по звонкам
                </h2>
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-semibold text-emerald-400">
                    {typeof analytics.avgScore === "number"
                      ? analytics.avgScore.toFixed(1)
                      : ""}
                  </span>
                  <span className="text-sm text-neutral-500">/ 100</span>
                </div>
                <p className="mt-3 text-xs text-neutral-400">
                  Скоро здесь будет более детальная аналитика: распределение по менеджерам,
                  динамика по дням, конверсия из звонка в сделку и многое другое.
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-5 text-xs text-neutral-400">
                <h2 className="text-sm font-medium text-neutral-100 mb-2">
                  Как читать эту страницу
                </h2>
                <ul className="space-y-2 list-disc list-inside">
                  <li>
                    <span className="text-neutral-200">Всего звонков</span>  все звонки
                    компании за выбранный период.
                  </li>
                  <li>
                    <span className="text-neutral-200">Обработано</span>  звонки в статусе{" "}
                    <code className="rounded bg-neutral-900 px-1.5 py-0.5 text-[10px]">
                      DONE
                    </code>
                    , у которых есть транскрипт и скоринг.
                  </li>
                  <li>
                    <span className="text-neutral-200">В очереди/анализе</span>  звонки, которые ещё не
                    прошли полный пайплайн.
                  </li>
                  <li>
                    <span className="text-neutral-200">Ошибки</span>  звонки в статусе{" "}
                    <code className="rounded bg-neutral-900 px-1.5 py-0.5 text-[10px]">
                      ERROR
                    </code>
                    . Их можно отследить и перезапустить позже.
                  </li>
                </ul>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function MetricCard(props: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4">
      <p className="text-xs text-neutral-400 mb-1">{props.label}</p>
      <div className="text-3xl font-semibold text-neutral-50">
        {props.value ?? 0}
      </div>
      {props.hint && (
        <p className="mt-2 text-[11px] text-neutral-500">{props.hint}</p>
      )}
    </div>
  );
}
