// src/app/(app)/app/calls/page.tsx

"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CallStatusBadge } from "@/components/CallStatusBadge";

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

export default function CallsPage() {
  const [period, setPeriod] = useState<string>("7d");
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [calls, setCalls] = useState<CallItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      // ???????? ??????? ?????? ?? NEW, ????? ???? ????? ?????? ????????
      setCalls((prev) =>
        prev.map((c) =>
          c.id === callId ? { ...c, status: "NEW" } : c
        )
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


  /* AUTO-REFRESH CALLS */
  React.useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/calls?period=7d");
        if (!res.ok) return;

        const data = await res.json();
        // ???????, ??? API ?????? ???? { calls: [...] }, ???? ?????? ??????
        const nextCalls = Array.isArray(data) ? data : data.calls ?? [];
        if (Array.isArray(nextCalls)) {
          // ????????? ?????? ?????? ???? ???-?? ??????? ?????????? ?? ?????
          // (????? ?? ??????? ?????? ??????)
          // ????? ????????? ????? ?? id/???????
          if (nextCalls.length !== calls.length) {
            setCalls(nextCalls);
          }
        }
      } catch (e) {
        console.error("[CALLS] auto-refresh error", e);
      }
    }, 8000); // ?????? 8 ??????

    return () => clearInterval(interval);
  }, [calls.length]);
  return (
    <main className="min-h-screen w-full bg-black text-neutral-50 relative overflow-hidden">
      {/* Фон: неон + сетка */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(74,222,128,0.25),_transparent)] blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(56,189,248,0.2),_transparent)] blur-3xl" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:radial-gradient(circle_at_1px_1px,#27272a_1px,transparent_0)] [background-size:16px_16px]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 sm:px-6 lg:px-8 py-8 sm:py-10 lg:py-12">
        {/* HEADER */}
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950/70 px-3 py-1 text-[11px] text-neutral-400 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Лента звонков из amoCRM</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight">
              Звонки
            </h1>
            <p className="text-sm text-neutral-400 max-w-xl">
              Все звонки, которые CallX забрал из amoCRM, с фильтром по периоду
              и статусу анализа. Смотри, что уже обработано, а что ещё в очереди.
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end gap-2 text-xs text-neutral-400">
            <div className="inline-flex gap-1 rounded-full border border-neutral-800 bg-neutral-950/70 px-3 py-1">
              <span className="text-neutral-500">Период:</span>
              <span className="font-medium text-neutral-200">
                {PERIOD_OPTIONS.find((p) => p.value === period)?.label ?? ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPeriod(opt.value)}
                  className={`rounded-full px-3 py-1 text-[11px] transition border ${
                    period === opt.value
                      ? "bg-gradient-to-r from-emerald-400 to-lime-300 text-black border-transparent shadow-[0_0_18px_rgba(74,222,128,0.6)]"
                      : "bg-neutral-950/80 text-neutral-300 border-neutral-800 hover:border-neutral-600 hover:text-neutral-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
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
            className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100"
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
            {/* SUMMARY */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="grid gap-4 md:grid-cols-3"
            >
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.7)]">
                <div className="text-[11px] uppercase text-neutral-500">
                  Всего звонков
                </div>
                <div className="mt-2 text-2xl sm:text-3xl font-semibold">
                  {totalCalls}
                </div>
                <p className="mt-2 text-[12px] text-neutral-500">
                  Всё, что попало в CallX за выбранный период.
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.7)]">
                <div className="text-[11px] uppercase text-neutral-500">
                  Проанализировано (DONE)
                </div>
                <div className="mt-2 text-2xl sm:text-3xl font-semibold">
                  {analyzedCalls}
                </div>
                <p className="mt-2 text-[12px] text-neutral-500">
                  Звонки, по которым уже есть результат анализа.
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.7)]">
                <div className="text-[11px] uppercase text-neutral-500">
                  В очереди / не завершено
                </div>
                <div className="mt-2 text-2xl sm:text-3xl font-semibold">
                  {pendingCalls}
                </div>
                <p className="mt-2 text-[12px] text-neutral-500">
                  NEW / PROCESSING / FAILED — то, что ещё нужно добить.
                </p>
              </div>
            </motion.div>

            {/* TABLE */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">
                  Лента звонков
                </h2>
                {totalCalls > 0 && (
                  <span className="text-[11px] text-neutral-500">
                    Показано:{" "}
                    <span className="text-neutral-200">{totalCalls}</span>
                  </span>
                )}
              </div>

              <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/80 shadow-[0_18px_50px_rgba(0,0,0,0.8)]">
                <div className="max-h-[540px] w-full overflow-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-neutral-950/90 text-[11px] uppercase text-neutral-500">
                      <tr>
                        <th className="px-4 py-3">Время</th>
                        <th className="px-4 py-3">Статус</th>
                        <th className="px-4 py-3">Score</th>
                        <th className="px-4 py-3">Длительность (сек)</th>
                        <th className="px-4 py-3">ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calls.length === 0 && (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-4 py-6 text-center text-xs text-neutral-500"
                          >
                            Звонков за выбранный период пока нет.
                          </td>
                        </tr>
                      )}
                      {calls.map((c) => {
                        const dt = new Date(c.createdAt);
                        const formatted = dt.toLocaleString("ru-RU");

                        return (
                          <tr
                            key={c.id}
                            className="border-t border-neutral-800/80 hover:bg-neutral-900/70 transition-colors"
                          >
                            <td className="px-4 py-2 text-sm text-neutral-200 whitespace-nowrap">
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
