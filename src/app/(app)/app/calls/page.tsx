// src/app/(app)/app/calls/page.tsx

"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CallStatusBadge } from "@/components/CallStatusBadge";
import { QuotaBanner } from "./QuotaBanner";

type CallItem = {
  id: string;
  status: string;
  score: number | null;
  duration: number | null;
  createdAt: string;
  [key: string]: any;
};

const PERIOD_OPTIONS: { value: string; label: string }[] = [
  { value: "7d", label: "7 дней" },
  { value: "30d", label: "30 дней" },
  { value: "90d", label: "90 дней" },
  { value: "365d", label: "Все (365 дней)" },
];

const STATUS_FILTERS = [
  { value: "all", label: "Все" },
  { value: "DONE", label: "DONE" },
  { value: "NEW", label: "NEW" },
  { value: "PROCESSING", label: "PROCESSING" },
  { value: "FAILED", label: "FAILED" },
] as const;

type StatusFilterValue = (typeof STATUS_FILTERS)[number]["value"];

export default function CallsPage() {
  const [period, setPeriod] = useState<string>("7d");
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [calls, setCalls] = useState<CallItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const [search, setSearch] = useState<string>("");

  // Первичная загрузка по периоду
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/calls?period=${period}`);
        if (!res.ok) {
          throw new Error("Failed to load calls");
        }
        const data = await res.json();
        setCalls(Array.isArray(data.calls) ? data.calls : []);
      } catch (e: any) {
        console.error("Calls page load error", e);
        setError(e?.message ?? "Ошибка загрузки данных");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [period]);

  /* CALLS RETRY HANDLER */
  async function handleRetry(callId: string) {
    try {
      setRetryingId(callId);
      const res = await fetch("/api/calls/retry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ callId }),
      });

      if (!res.ok) {
        console.error("Retry failed", await res.text());
        return;
      }

      // Обновляем статус на NEW, чтобы было видно, что звонок снова в очереди
      setCalls((prev) =>
        prev.map((c) => (c.id === callId ? { ...c, status: "NEW" } : c))
      );
    } catch (e) {
      console.error("Retry error", e);
    } finally {
      setRetryingId(null);
    }
  }

  const totalCalls = calls.length;
  const analyzedCalls = calls.filter((c) => c.status === "DONE").length;
  const pendingCalls = totalCalls - analyzedCalls;

  const failedCalls = calls.filter((c) => c.status === "FAILED").length;
  const newCalls = calls.filter((c) => c.status === "NEW").length;
  const processingCalls = calls.filter((c) => c.status === "PROCESSING").length;

  const doneRate =
    totalCalls > 0 ? Math.round((analyzedCalls * 100) / totalCalls) : 0;

  // Фильтр по статусу и поиск по ID
  const filteredCalls = calls.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      // ищем по ID (можно расширить позже по полям из CRM)
      if (!c.id.toLowerCase().includes(q)) return false;
    }

    return true;
  });

  /* AUTO-REFRESH CALLS */
  React.useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/calls?period=${period}`);
        if (!res.ok) return;

        const data = await res.json();
        const nextCalls = Array.isArray(data.calls) ? data.calls : [];
        if (Array.isArray(nextCalls) && nextCalls.length !== calls.length) {
          setCalls(nextCalls);
        }
      } catch (e) {
        console.error("[CALLS] auto-refresh error", e);
      }
    }, 8000);

    return () => clearInterval(interval);
    // следим только за длиной и периодом, чтобы не дёргаться лишний раз
  }, [calls.length, period]);

  return (
    <main className="min-h-screen w-full bg-black text-neutral-50">
      <div className="mx-auto flex w-full max-w-none flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10 lg:px-10 lg:py-12 xl:px-16">
        {/* HEADER */}
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-900 bg-neutral-950/95 px-3.5 py-1.5 text-[11px] text-neutral-400 shadow-[0_0_26px_rgba(34,197,94,0.2)]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Лента звонков из amoCRM</span>
              <span className="hidden text-[10px] text-neutral-500 sm:inline">
                авто-обновление каждые 8 секунд
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
              Звонки
            </h1>
            <p className="max-w-2xl text-sm text-neutral-400">
              Все звонки, которые CallX забрал из amoCRM, с фильтром по периоду
              и статусу анализа. Смотри, что уже обработано, а что ещё в очереди.
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 text-xs text-neutral-400 md:items-end">
            <div className="inline-flex gap-1 rounded-full border border-neutral-900 bg-neutral-950/90 px-3 py-1">
              <span className="text-neutral-500">Период:</span>
              <span className="font-medium text-neutral-200">
                {PERIOD_OPTIONS.find((p) => p.value === period)?.label ?? ""}
              </span>
            </div>
            <div className="flex flex-wrap justify-end gap-1.5">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPeriod(opt.value)}
                  className={`rounded-full px-3.5 py-1.5 text-[11px] border transition ${
                    period === opt.value
                      ? "bg-gradient-to-r from-emerald-400 to-lime-300 text-black border-transparent shadow-[0_0_18px_rgba(74,222,128,0.7)]"
                      : "bg-neutral-950 text-neutral-300 border-neutral-900 hover:border-neutral-600 hover:text-neutral-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* 🔥 Квота + баннер */}
        <QuotaBanner />

        {/* LOADING */}
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-neutral-900 bg-neutral-950/95 px-4 py-6 text-sm text-neutral-300 shadow-[0_18px_50px_rgba(0,0,0,0.85)]"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 animate-pulse rounded-2xl border border-neutral-800 bg-neutral-900" />
              <div className="space-y-1">
                <p className="text-sm">Загружаем звонки…</p>
                <p className="text-[11px] text-neutral-500">
                  Подтягиваем историю из amoCRM и собираем ленту по выбранному
                  периоду.
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
            className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100 shadow-[0_18px_40px_rgba(0,0,0,0.7)]"
          >
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-400" />
              <span className="font-medium">Ошибка загрузки звонков</span>
            </div>
            <p className="mt-1.5 text-[13px]">{error}</p>
          </motion.div>
        )}

        {!loading && !error && (
          <>
            {/* SUMMARY DASHBOARD */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="grid gap-4 md:grid-cols-3"
            >
              {/* Всего */}
              <div className="rounded-2xl border border-neutral-900 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900/90 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.7)] transition-shadow hover:shadow-[0_22px_60px_rgba(0,0,0,0.9)]">
                <div className="text-[11px] uppercase text-neutral-500">
                  Всего звонков
                </div>
                <div className="mt-2 text-2xl font-semibold sm:text-3xl">
                  {totalCalls}
                </div>
                <p className="mt-2 text-[12px] text-neutral-500">
                  Всё, что попало в CallX за выбранный период.
                </p>
              </div>

              {/* DONE */}
              <div className="rounded-2xl border border-neutral-900 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900/90 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.7)] transition-shadow hover:shadow-[0_22px_60px_rgba(0,0,0,0.9)]">
                <div className="text-[11px] uppercase text-neutral-500">
                  Проанализировано (DONE)
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <div className="text-2xl font-semibold sm:text-3xl">
                    {analyzedCalls}
                  </div>
                  {totalCalls > 0 && (
                    <span className="text-xs text-emerald-300">
                      {doneRate}% от всех
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[12px] text-neutral-500">
                  Звонки, по которым уже есть результат анализа.
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

              {/* Очередь / статусы */}
              <div className="rounded-2xl border border-neutral-900 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900/90 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.7)] transition-shadow hover:shadow-[0_22px_60px_rgba(0,0,0,0.9)]">
                <div className="text-[11px] uppercase text-neutral-500">
                  В очереди / по статусам
                </div>
                <div className="mt-2 text-2xl font-semibold sm:text-3xl">
                  {pendingCalls}
                </div>
                <p className="mt-2 text-[12px] text-neutral-500">
                  NEW / PROCESSING / FAILED — то, что ещё нужно добить.
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-neutral-300">
                  <span className="inline-flex items-center gap-1 rounded-full bg-neutral-900 px-2 py-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                    NEW: {newCalls}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-neutral-900 px-2 py-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    PROCESSING: {processingCalls}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-neutral-900 px-2 py-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                    FAILED: {failedCalls}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* ФИЛЬТРЫ ПЕРЕД ТАБЛИЦЕЙ */}
            <section className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => setStatusFilter(f.value)}
                      className={`rounded-full border px-3 py-1.5 text-[11px] transition ${
                        statusFilter === f.value
                          ? "border-emerald-400 bg-emerald-500/10 text-emerald-300 shadow-[0_0_16px_rgba(74,222,128,0.4)]"
                          : "border-neutral-800 bg-neutral-950 text-neutral-300 hover:border-neutral-600 hover:text-neutral-100"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="flex w-full max-w-xs items-center rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-[12px] text-neutral-300">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Поиск по ID звонка…"
                    className="w-full bg-transparent text-xs text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">
                  Лента звонков
                </h2>
                {totalCalls > 0 && (
                  <span className="text-[11px] text-neutral-500">
                    Показано:{" "}
                    <span className="text-neutral-200">
                      {filteredCalls.length}
                    </span>{" "}
                    из {totalCalls}
                  </span>
                )}
              </div>

              {/* TABLE */}
              <div className="overflow-hidden rounded-2xl border border-neutral-900 bg-neutral-950 shadow-[0_18px_50px_rgba(0,0,0,0.8)]">
                <div className="max-h-[540px] w-full overflow-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-neutral-950 text-[11px] uppercase text-neutral-500">
                      <tr>
                        <th className="px-4 py-3">Время</th>
                        <th className="px-4 py-3">Статус</th>
                        <th className="px-4 py-3">Score</th>
                        <th className="px-4 py-3">Длительность (сек)</th>
                        <th className="px-4 py-3">ID</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCalls.length === 0 && (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-4 py-6 text-center text-xs text-neutral-500"
                          >
                            Звонков под текущий фильтр пока нет.
                          </td>
                        </tr>
                      )}
                      {filteredCalls.map((c) => {
                        const dt = new Date(c.createdAt);
                        const formatted = dt.toLocaleString("ru-RU");
                        const canRetry = c.status === "FAILED";

                        return (
                          <tr
                            key={c.id}
                            className="border-t border-neutral-800/80 transition-colors hover:bg-neutral-900/70"
                          >
                            <td className="whitespace-nowrap px-4 py-2 text-sm text-neutral-200">
                              {formatted}
                            </td>
                            <td className="px-4 py-2 text-sm">
                              <CallStatusBadge status={c.status} />
                            </td>
                            <td className="px-4 py-2 text-sm text-neutral-200">
                              {typeof c.score === "number"
                                ? `${c.score}/100`
                                : "—"}
                            </td>
                            <td className="px-4 py-2 text-sm text-neutral-200">
                              {typeof c.duration === "number"
                                ? c.duration
                                : "—"}
                            </td>
                            <td className="px-4 py-2 text-[11px] text-neutral-500">
                              {c.id}
                            </td>
                            <td className="px-4 py-2 text-right">
                              {canRetry && (
                                <button
                                  onClick={() => handleRetry(c.id)}
                                  disabled={retryingId === c.id}
                                  className="inline-flex items-center rounded-full border border-red-500/50 bg-red-500/10 px-3 py-1 text-[11px] text-red-200 transition hover:border-red-400 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {retryingId === c.id
                                    ? "Повторяем…"
                                    : "Повторить анализ"}
                                </button>
                              )}
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
