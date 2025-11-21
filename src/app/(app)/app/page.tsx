// src/app/(app)/app/page.tsx

"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

type CallItem = {
  id: string;
  status: string;
  score: number | null;
  createdAt: string;
  [key: string]: any;
};

export default function AppDashboardPage() {
  const [calls, setCalls] = useState<CallItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        // последние 7 дней
        const res = await fetch("/api/calls?period=7d");
        if (!res.ok) {
          throw new Error("Failed to load calls");
        }
        const data = await res.json();
        setCalls(Array.isArray(data.calls) ? data.calls : []);
      } catch (e: any) {
        console.error("App dashboard load error", e);
        setError(e?.message ?? "Ошибка загрузки данных");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const totalCalls = calls.length;
  const analyzedCalls = calls.filter((c) => c.status === "DONE").length;

  const scoredCalls = calls.filter(
    (c) => typeof c.score === "number" && c.score !== null
  );
  const avgScore =
    scoredCalls.length > 0
      ? Math.round(
          scoredCalls.reduce((sum, c) => sum + (c.score ?? 0), 0) /
            scoredCalls.length
        )
      : 0;

  const doneRate =
    totalCalls > 0 ? Math.round((analyzedCalls * 100) / totalCalls) : 0;

  const pendingCalls = totalCalls - analyzedCalls;

  // Берём последние 5 звонков для мини-ленты
  const latestCalls = [...calls]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 5);

  return (
    <main className="min-h-screen w-full bg-black text-neutral-50 relative overflow-hidden">
      {/* Фон: неон + сетка */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(74,222,128,0.25),_transparent)] blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(56,189,248,0.2),_transparent)] blur-3xl" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:radial-gradient(circle_at_1px_1px,#27272a_1px,transparent_0)] [background-size:16px_16px]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 sm:px-6 lg:px-8 py-8 sm:py-10 lg:py-12">
        {/* HEADER */}
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950/70 px-3 py-1 text-[11px] text-neutral-400 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Главный дашборд CallX</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight">
              Обзор отдела продаж (7 дней)
            </h1>
            <p className="text-sm text-neutral-400 max-w-xl">
              Активность по звонкам, сколько CallX успел разобрать и какой
              средний балл по отделу за последние 7 дней.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-neutral-400">
            <span className="rounded-full border border-neutral-800 bg-neutral-950/70 px-3 py-1">
              Период: 7 дней
            </span>
            <span className="rounded-full border border-neutral-800 bg-neutral-950/70 px-3 py-1">
              Источник: /api/calls
            </span>
          </div>
        </header>

        {/* LOADING */}
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-neutral-800 bg-neutral-950/80 px-4 py-6 text-sm text-neutral-300 shadow-[0_18px_50px_rgba(0,0,0,0.85)]"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl bg-neutral-900 border border-neutral-800 animate-pulse" />
              <div className="space-y-1">
                <p className="text-sm">Загружаем данные по звонкам…</p>
                <p className="text-[11px] text-neutral-500">
                  CallX подтягивает свежие звонки из amoCRM и собирает краткий
                  дашборд по отделу.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ERROR */}
        {error && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100"
          >
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-400" />
              <span className="font-medium">Ошибка загрузки дашборда</span>
            </div>
            <p className="mt-1.5 text-[13px]">{error}</p>
          </motion.div>
        )}

        {/* CONTENT */}
        {!loading && !error && (
          <>
            {/* TOP STATS */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="grid gap-4 md:grid-cols-3"
            >
              {/* Всего звонков */}
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.7)]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase text-neutral-500">
                    Всего звонков
                  </span>
                  <span className="text-[10px] rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-neutral-500">
                    7 дней
                  </span>
                </div>
                <div className="mt-2 text-2xl sm:text-3xl font-semibold">
                  {totalCalls}
                </div>
                <p className="mt-2 text-[12px] text-neutral-500">
                  Все звонки, которые попали в CallX за последний период.
                </p>
              </div>

              {/* Проанализировано */}
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.7)]">
                <span className="text-[11px] uppercase text-neutral-500">
                  Проанализировано
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-semibold">
                    {analyzedCalls}
                  </span>
                  {totalCalls > 0 && (
                    <span className="text-xs text-emerald-300">
                      {doneRate}% от всех
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[12px] text-neutral-500">
                  Звонки со статусом <span className="text-neutral-200">DONE</span>.
                </p>
                {totalCalls > 0 && (
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-900">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300"
                      style={{ width: `${doneRate}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Средний балл */}
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.7)]">
                <span className="text-[11px] uppercase text-neutral-500">
                  Средний балл по отделу
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-semibold">
                    {avgScore || 0}/100
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-neutral-500">
                  Считаем только те звонки, где уже есть{" "}
                  <span className="text-neutral-200">score</span>.
                </p>
                <p className="mt-2 text-[11px] text-neutral-500">
                  Ниже 60 — тревога, выше 80 — сильная команда.
                </p>
              </div>
            </motion.div>

            {/* QUICK NAV */}
            <section className="mt-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">
                Разделы
              </h2>
              <div className="grid gap-4 md:grid-cols-3">
                <Link
                  href="/app/calls"
                  className="group rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 shadow-[0_16px_35px_rgba(0,0,0,0.75)] transition hover:border-emerald-400/70 hover:bg-neutral-900/90"
                >
                  <div className="text-[11px] uppercase text-neutral-500">
                    Calls
                  </div>
                  <div className="mt-2 text-lg font-semibold text-neutral-50">
                    Журнал звонков
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">
                    Лента всех вызовов с деталями, статусом и оценкой.
                  </p>
                  <div className="mt-3 text-xs text-emerald-400 opacity-80 group-hover:opacity-100">
                    Открыть →
                  </div>
                </Link>

                <Link
                  href="/app/analytics"
                  className="group rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 shadow-[0_16px_35px_rgba(0,0,0,0.75)] transition hover:border-emerald-400/70 hover:bg-neutral-900/90"
                >
                  <div className="text-[11px] uppercase text-neutral-500">
                    Analytics
                  </div>
                  <div className="mt-2 text-lg font-semibold text-neutral-50">
                    Глубокая аналитика
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">
                    Отчёты по менеджерам, конверсии и качеству разговоров.
                  </p>
                  <div className="mt-3 text-xs text-emerald-400 opacity-80 group-hover:opacity-100">
                    Смотреть отчёт →
                  </div>
                </Link>

                <Link
                  href="/app/integrations"
                  className="group rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 shadow-[0_16px_35px_rgba(0,0,0,0.75)] transition hover:border-emerald-400/70 hover:bg-neutral-900/90"
                >
                  <div className="text-[11px] uppercase text-neutral-500">
                    Integrations
                  </div>
                  <div className="mt-2 text-lg font-semibold text-neutral-50">
                    Интеграции
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">
                    Подключение amoCRM и других источников звонков.
                  </p>
                  <div className="mt-3 text-xs text-emerald-400 opacity-80 group-hover:opacity-100">
                    Настроить →
                  </div>
                </Link>
              </div>
            </section>

            {/* LATEST CALLS */}
            <section className="mt-6 space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">
                Последние звонки
              </h2>
              <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/80 shadow-[0_18px_50px_rgba(0,0,0,0.8)]">
                <div className="max-h-[340px] w-full overflow-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-neutral-950/90 text-[11px] uppercase text-neutral-500">
                      <tr>
                        <th className="px-4 py-3">Время</th>
                        <th className="px-4 py-3">Статус</th>
                        <th className="px-4 py-3">Score</th>
                        <th className="px-4 py-3">ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestCalls.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-6 text-center text-xs text-neutral-500"
                          >
                            Пока нет звонков за последние 7 дней.
                          </td>
                        </tr>
                      )}
                      {latestCalls.map((c) => {
                        const dt = new Date(c.createdAt);
                        const formatted = dt.toLocaleString("ru-RU");
                        const statusStyles =
                          c.status === "DONE"
                            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/40"
                            : c.status === "FAILED"
                            ? "bg-red-500/10 text-red-300 border-red-500/40"
                            : "bg-neutral-800/60 text-neutral-200 border-neutral-600/60";

                        return (
                          <tr
                            key={c.id}
                            className="border-t border-neutral-800/80 hover:bg-neutral-900/70 transition-colors"
                          >
                            <td className="px-4 py-2 text-sm text-neutral-200 whitespace-nowrap">
                              {formatted}
                            </td>
                            <td className="px-4 py-2 text-sm">
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] ${statusStyles}`}
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-current mr-1.5 opacity-80" />
                                {c.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-sm text-neutral-200">
                              {typeof c.score === "number"
                                ? `${c.score}/100`
                                : "—"}
                            </td>
                            <td className="px-4 py-2 text-[11px] text-neutral-500">
                              {c.id}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
