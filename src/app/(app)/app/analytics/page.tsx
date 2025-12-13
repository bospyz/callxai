// src/app/(app)/app/analytics/page.tsx

"use client";

import React from "react";
import { motion } from "framer-motion";

type DailyPoint = {
  date: string; // YYYY-MM-DD
  total: number;
  done: number;
  error: number;
};

type ManagerPoint = {
  managerId: string;
  name: string;
  total: number;
  done: number;
  avgScore: number | null;
};

type CallItem = {
  id: string;
  status: string;
  score: number | null;
  createdAt: string;
  managerName?: string;
  manager?: { name?: string };
  [key: string]: any;
};

type CompanyAnalytics = {
  totalCalls: number;
  doneCalls: number;
  errorCalls: number;
  processingCalls: number;
  avgScore: number | null;
};

export default function AnalyticsPage() {
  const [analytics, setAnalytics] =
    React.useState<CompanyAnalytics | null>(null);
  const [calls, setCalls] = React.useState<CallItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [summaryRes, callsRes] = await Promise.all([
          fetch("/api/analytics/summary?days=30"),
          fetch("/api/calls?period=30d"),
        ]);

        if (!summaryRes.ok) {
          throw new Error("Failed to load analytics");
        }
        if (!callsRes.ok) {
          throw new Error("Failed to load calls for analytics");
        }

        const summaryData = await summaryRes.json();
        const callsData = await callsRes.json();

        if (cancelled) return;

        setAnalytics(summaryData.analytics ?? null);
        setCalls(Array.isArray(callsData.calls) ? callsData.calls : []);
      } catch (err: any) {
        console.error("[Analytics] load error", err);
        if (!cancelled) {
          setError(err?.message ?? "Ошибка загрузки аналитики");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const hasAnyData = !!analytics || calls.length > 0;
  const withAnalytics = !loading && !error && hasAnyData;

  // ===== базовые метрики (если сводка пропала — считаем по звонкам) =====
  const total =
    analytics?.totalCalls ?? (calls.length > 0 ? calls.length : 0);

  const done =
    analytics?.doneCalls ??
    calls.filter((c) => c.status === "DONE").length;

  const errorsCount =
    analytics?.errorCalls ??
    calls.filter(
      (c) => c.status === "FAILED" || c.status === "ERROR"
    ).length;

  const processing =
    analytics?.processingCalls ??
    calls.filter(
      (c) => c.status === "NEW" || c.status === "PROCESSING"
    ).length;

  const avgScore =
    analytics?.avgScore ??
    (() => {
      const scored = calls.filter(
        (c) => typeof c.score === "number" && c.score !== null
      );
      if (!scored.length) return null;
      const sum = scored.reduce(
        (acc, c) => acc + (c.score ?? 0),
        0
      );
      return sum / scored.length;
    })();

  const doneRate = total > 0 ? Math.round((done * 100) / total) : 0;
  const errorRate =
    total > 0 ? Math.round((errorsCount * 100) / total) : 0;
  const queueRate =
    total > 0 ? Math.round((processing * 100) / total) : 0;

  // ===== агрегации по звонкам =====
  const daily: DailyPoint[] = React.useMemo(() => {
    if (!calls.length) return [];
    const map = new Map<string, DailyPoint>();

    for (const c of calls) {
      const d = new Date(c.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD

      if (!map.has(key)) {
        map.set(key, { date: key, total: 0, done: 0, error: 0 });
      }
      const entry = map.get(key)!;
      entry.total += 1;
      if (c.status === "DONE") entry.done += 1;
      if (c.status === "FAILED" || c.status === "ERROR") entry.error += 1;
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [calls]);

  const managers: ManagerPoint[] = React.useMemo(() => {
    if (!calls.length) return [];
    const map = new Map<
      string,
      {
        name: string;
        total: number;
        done: number;
        scoreSum: number;
        scoreCount: number;
      }
    >();

    for (const c of calls) {
      const id =
        (c as any).managerId ??
        (c as any).manager_id ??
        (c.managerName ??
          c.manager?.name ??
          (c as any).manager_name ??
          "Без менеджера");

      const name =
        c.managerName ??
        c.manager?.name ??
        (c as any).manager_name ??
        "Без менеджера";

      if (!map.has(id)) {
        map.set(id, {
          name,
          total: 0,
          done: 0,
          scoreSum: 0,
          scoreCount: 0,
        });
      }

      const entry = map.get(id)!;
      entry.total += 1;
      if (c.status === "DONE") entry.done += 1;
      if (typeof c.score === "number") {
        entry.scoreSum += c.score;
        entry.scoreCount += 1;
      }
    }

    return Array.from(map.entries())
      .map(([managerId, v]) => ({
        managerId,
        name: v.name,
        total: v.total,
        done: v.done,
        avgScore:
          v.scoreCount > 0 ? v.scoreSum / v.scoreCount : null,
      }))
      .sort((a, b) => b.total - a.total);
  }, [calls]);

  const sortedByVolume = [...managers].sort(
    (a, b) => b.total - a.total
  );
  const sortedByScore = [...managers]
    .filter((m) => typeof m.avgScore === "number")
    .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0));

  const bestByVolume = sortedByVolume[0];
  const bestByScore = sortedByScore[0];

  return (
    <main className="min-h-screen w-full bg-black text-neutral-50">
    <div className="mx-auto w-full max-w-none px-4 sm:px-6 lg:px-10 xl:px-16 py-8 sm:py-10 lg:py-12 space-y-7">

        {/* HEADER */}
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950/90 px-3.5 py-1.5 text-[11px] text-neutral-400 shadow-[0_0_22px_rgba(34,197,94,0.22)]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>CALLX · ANALYTICS</span>
              <span className="hidden sm:inline text-[10px] text-neutral-500">
                данные за последние 30 дней
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight">
              Аналитика по звонкам
            </h1>
            <p className="max-w-xl text-sm text-neutral-400">
              Сводка того, что происходит в отделе: сколько звонков CallX
              разобрал, где очередь, а где проблемы по аудио и интеграции.
            </p>
          </div>

          {withAnalytics && (
            <div className="flex flex-col items-start md:items-end gap-1.5 text-xs text-neutral-500">
              <div>
                Всего звонков за 30 дней:{" "}
                <span className="font-semibold text-neutral-100">
                  {total}
                </span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-neutral-950/80 border border-neutral-800 px-3 py-1 text-[11px]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>Дашборд обновляется в реальном времени</span>
              </div>
            </div>
          )}
        </header>

        {/* LOADING */}
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-neutral-900 bg-neutral-950/90 px-5 py-6 text-sm text-neutral-300 shadow-[0_18px_40px_rgba(0,0,0,0.85)]"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-2xl bg-neutral-900 border border-neutral-800 animate-pulse" />
              <div>
                <p className="text-sm">Подгружаем аналитику по звонкам…</p>
                <p className="mt-1 text-[11px] text-neutral-500">
                  Считаем DONE / ERROR / PROCESSING и средний score по
                  всем звонкам за последние 30 дней.
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
            className="rounded-2xl border border-red-500/40 bg-red-950/60 p-4 text-sm text-red-100 shadow-[0_16px_40px_rgba(0,0,0,0.9)]"
          >
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <span className="h-2 w-2 rounded-full bg-red-400" />
              <span>Ошибка загрузки аналитики</span>
            </div>
            <div className="text-[13px]">{error}</div>
          </motion.div>
        )}

        {/* НЕТ ДАННЫХ */}
        {!loading && !error && !hasAnyData && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-neutral-800 bg-neutral-950/90 p-5 text-sm text-neutral-300"
          >
            <h2 className="text-base font-medium mb-1.5">
              Пока нет данных для аналитики
            </h2>
            <p className="text-[12px] text-neutral-500 max-w-xl">
              Подключи AmoCRM / Bitrix24 в разделе{" "}
              <span className="text-neutral-100">«Интеграции»</span>, налей
              первые звонки — и здесь появятся графики, статистика по
              менеджерам и инсайты по отделу.
            </p>
          </motion.div>
        )}

        {/* CONTENT */}
        {withAnalytics && (
          <>
            {/* TOP ROW: большие метрики */}
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
            >
              <MetricCard
                label="Всего звонков"
                value={total}
                hint="Все звонки, которые CallX увидел за 30 дней"
                tone="default"
              />
              <MetricCard
                label="DONE — разобрано"
                value={done}
                delta={doneRate}
                hint="Есть транскрипт и скоринг по звонку"
                tone="good"
              />
              <MetricCard
                label="В очереди / обработке"
                value={processing}
                delta={queueRate}
                hint="NEW + PROCESSING, ещё не готовы"
                tone="warn"
              />
              <MetricCard
                label="Ошибки анализа"
                value={errorsCount}
                delta={errorRate}
                hint="ERROR — проблемы с аудио или интеграцией"
                tone="danger"
              />
            </motion.section>

            {/* SECOND ROW: качество отдела + статусы */}
            <section className="grid gap-4 lg:grid-cols-[1.5fr,1.1fr]">
              {/* средний score */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="relative overflow-hidden rounded-3xl border border-neutral-900 bg-neutral-950/95 p-5 sm:p-6 shadow-[0_20px_55px_rgba(0,0,0,0.9)]"
              >
                <div className="pointer-events-none absolute inset-0 opacity-[0.2] bg-[radial-gradient(circle_at_1px_1px,#ffffff22_1px,transparent_0)] [background-size:18px_18px]" />
                <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                      Средний score отдела
                    </p>
                    <div className="mt-2 flex items-baseline gap-3">
                      <span className="text-4xl sm:text-5xl font-semibold text-emerald-400">
                        {typeof avgScore === "number"
                          ? avgScore.toFixed(1)
                          : "--"}
                      </span>
                      <span className="text-sm text-neutral-500">
                        / 100
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-neutral-400 max-w-md">
                      Чем выше балл, тем чище работа по скрипту, выявлению
                      потребности и закрытию на следующий шаг.
                    </p>
                  </div>

                  {/* индикатор уровня */}
                  <div className="mt-3 sm:mt-0 w-full max-w-xs">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-neutral-500">
                      <span>Уровень команды</span>
                      <span>
                        {typeof avgScore === "number" && avgScore < 60
                          ? "Ниже нормы"
                          : typeof avgScore === "number" &&
                            avgScore < 80
                          ? "Средний"
                          : "Сильный уровень"}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-neutral-900 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400"
                        style={{
                          width: `${
                            typeof avgScore === "number"
                              ? Math.min(avgScore, 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    <div className="mt-2 flex justify-between text-[10px] text-neutral-500">
                      <span>&lt; 60 — тревога</span>
                      <span>60–80 — средне</span>
                      <span>&gt; 80 — топ</span>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* статусы */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="rounded-3xl border border-neutral-900 bg-neutral-950/95 p-5 sm:p-6 flex flex-col gap-4 shadow-[0_20px_55px_rgba(0,0,0,0.9)]"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-neutral-100">
                    Статусы звонков
                  </h2>
                </div>

                <StatusRow
                  label="DONE — разобрано"
                  count={done}
                  total={total}
                  tone="good"
                />
                <StatusRow
                  label="NEW / PROCESSING — в очереди"
                  count={processing}
                  total={total}
                  tone="warn"
                />
                <StatusRow
                  label="ERROR — проблемы"
                  count={errorsCount}
                  total={total}
                  tone="danger"
                />

                <p className="mt-1 text-[11px] text-neutral-500">
                  Цель — максимально раздувать зелёную зону DONE и
                  вычищать ошибки. Чем меньше очередь и ERROR, тем ближе
                  отдел к прозрачности.
                </p>
              </motion.div>
            </section>

            {/* THIRD ROW: график + менеджеры */}
            <section className="grid gap-4 xl:grid-cols-[1.6fr,1.1fr]">
              <DailyChartCard daily={daily} />

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="rounded-3xl border border-neutral-900 bg-neutral-950/95 p-5 sm:p-6 flex flex-col gap-4 shadow-[0_20px_55px_rgba(0,0,0,0.9)]"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-neutral-100">
                    Менеджеры — топ по отделу
                  </h2>
                  <span className="text-[11px] text-neutral-500">
                    По объёму и качеству речи
                  </span>
                </div>

                {managers.length === 0 && (
                  <p className="text-[12px] text-neutral-500">
                    Пока нет данных по менеджерам за последние 30 дней.
                    Как только в звонках появятся{" "}
                    <code className="rounded bg-neutral-900 px-1 py-0.5 text-[10px]">
                      managerName / manager.name
                    </code>
                    , дашборд заполнится.
                  </p>
                )}

                {managers.length > 0 && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ManagerHighlight
                        title="Лидер по количеству звонков"
                        manager={bestByVolume}
                        badge="🏆 Объём"
                      />
                      <ManagerHighlight
                        title="Лидер по качеству (score)"
                        manager={bestByScore}
                        badge="💬 Качество"
                      />
                    </div>

                    <ManagerTable managers={managers} />
                  </>
                )}
              </motion.div>
            </section>

            {/* FOURTH ROW: инсайты */}
            <section className="grid gap-4 lg:grid-cols-3">
              <InsightCard
                title="Что сделать прямо сейчас"
                points={[
                  `Отфильтруй ERROR-звонки и проверь, нет ли проблем с телефонией или ключами интеграции.`,
                  `Возьми несколько звонков с низким score и сделай разбор с менеджером — вылови повторяющиеся ошибки.`,
                  `Сделай плейлист лучших звонков (score > 85) и прокрути его с новой командой.`,
                ]}
              />
              <InsightCard
                title="Как читать эти цифры"
                points={[
                  `«Всего звонков» — всё, что прошло через CallX за последние 30 дней.`,
                  `«DONE» — безопасная зона: есть транскрипт, score и этапы разговора.`,
                  `«В очереди» — звонки ещё считаются. Если их слишком много — значит, нагрузка на воркеры высокая.`,
                ]}
              />
              <InsightCard
                title="Как улучшать отдел"
                points={[
                  `Гонись не только за количеством звонков, но и за ростом среднего score.`,
                  `При росте ERROR сверь форматы аудио, права доступа и настройки интеграции.`,
                  `Раз в неделю делай мини-ретро по дашборду: что выросло, что просело и почему.`,
                ]}
              />
            </section>
          </>
        )}
      </div>
    </main>
  );
}

/* ===== ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ ===== */

type MetricTone = "default" | "good" | "warn" | "danger";

function MetricCard(props: {
  label: string;
  value: number;
  hint?: string;
  delta?: number;
  tone?: MetricTone;
}) {
  const tone = props.tone ?? "default";

  const toneClasses: Record<MetricTone, string> = {
    default: "border-neutral-800 bg-neutral-950/90",
    good: "border-emerald-500/30 bg-emerald-500/5",
    warn: "border-amber-400/40 bg-amber-400/5",
    danger: "border-red-500/40 bg-red-500/5",
  };

  const deltaColor =
    tone === "good"
      ? "text-emerald-300"
      : tone === "warn"
      ? "text-amber-300"
      : tone === "danger"
      ? "text-red-300"
      : "text-neutral-400";

  return (
    <div
      className={`rounded-2xl border px-4 py-4 sm:px-5 sm:py-5 shadow-[0_16px_45px_rgba(0,0,0,0.85)] ${toneClasses[tone]}`}
    >
      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-500">
        {props.label}
      </p>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-3xl sm:text-4xl font-semibold text-neutral-50">
          {props.value ?? 0}
        </div>
        {typeof props.delta === "number" && (
          <div
            className={`inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[10px] ${deltaColor}`}
          >
            <span>{props.delta}%</span>
          </div>
        )}
      </div>
      {props.hint && (
        <p className="mt-2 text-[11px] text-neutral-500">{props.hint}</p>
      )}
    </div>
  );
}

function StatusRow(props: {
  label: string;
  count: number;
  total: number;
  tone: "good" | "warn" | "danger";
}) {
  const { label, count, total, tone } = props;
  const percent = total > 0 ? Math.round((count * 100) / total) : 0;

  const barClass =
    tone === "good"
      ? "from-emerald-400 to-lime-300"
      : tone === "warn"
      ? "from-amber-400 to-orange-300"
      : "from-red-500 to-rose-400";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-neutral-400">
        <span>{label}</span>
        <span className="text-neutral-300">
          {count}{" "}
          {total > 0 && (
            <span className="text-neutral-500">· {percent}%</span>
          )}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-neutral-900 overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barClass}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/* ===== ГРАФИК ПО ДНЯМ ===== */

function DailyChartCard({ daily }: { daily: DailyPoint[] }) {
  const points = [...daily].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const maxTotal =
    points.length > 0
      ? Math.max(...points.map((p) => p.total || 0))
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
      className="rounded-3xl border border-neutral-900 bg-neutral-950/95 p-5 sm:p-6 flex flex-col shadow-[0_20px_55px_rgba(0,0,0,0.9)]"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-neutral-100">
          Динамика звонков по дням
        </h2>
        <span className="text-[11px] text-neutral-500">
          Столбики — всего, зелёное — DONE
        </span>
      </div>

      {points.length === 0 && (
        <p className="text-[12px] text-neutral-500">
          Пока нет звонков за последние 30 дней для построения графика.
        </p>
      )}

      {points.length > 0 && (
        <div className="mt-2 h-56 w-full rounded-2xl bg-neutral-950 border border-neutral-900 px-3 py-3 flex flex-col justify-between">
          <div className="flex-1 flex items-end gap-2">
            {points.map((p) => {
              const height =
                maxTotal > 0 ? (p.total / maxTotal) * 100 : 0;
              const doneHeight =
                maxTotal > 0 ? (p.done / maxTotal) * 100 : 0;

              const label = new Date(p.date).toLocaleDateString(
                "ru-RU",
                { day: "2-digit", month: "short" }
              );

              return (
                <div
                  key={p.date}
                  className="flex-1 flex flex-col items-center justify-end gap-1"
                >
                  <div className="relative w-full max-w-[20px] flex-1 flex items-end justify-center">
                    <div
                      className="w-full rounded-t-full bg-gradient-to-t from-neutral-800 to-neutral-700"
                      style={{ height: `${height || 3}%` }}
                    />
                    <div
                      className="absolute bottom-0 w-[60%] rounded-t-full bg-gradient-to-t from-emerald-400 to-lime-300 shadow-[0_0_12px_rgba(74,222,128,0.7)]"
                      style={{ height: `${doneHeight || 0}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-neutral-500">
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

/* ===== МЕНЕДЖЕРЫ ===== */

function ManagerHighlight(props: {
  title: string;
  manager?: ManagerPoint;
  badge: string;
}) {
  const m = props.manager;

  if (!m) {
    return (
      <div className="rounded-2xl border border-neutral-900 bg-neutral-950/90 p-4 text-[12px] text-neutral-500">
        <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
          {props.title}
        </div>
        <p>Лидер появится, когда подтянутся звонки с менеджерами.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-900 bg-neutral-950/90 p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.18ем] text-neutral-500">
          {props.title}
        </span>
        <span className="inline-flex items-center rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-300">
          {props.badge}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-[11px] text-neutral-100">
          {m.name?.[0]?.toUpperCase() || "M"}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-neutral-50">
            {m.name}
          </span>
          <span className="text-[11px] text-neutral-500">
            {m.total} звонков · DONE {m.done}
            {typeof m.avgScore === "number" &&
              ` · score ${m.avgScore.toFixed(0)}/100`}
          </span>
        </div>
      </div>
    </div>
  );
}

function ManagerTable({ managers }: { managers: ManagerPoint[] }) {
  if (!managers.length) return null;

  return (
    <div className="mt-3 rounded-2xl border border-neutral-900 bg-neutral-950/90 overflow-hidden text-xs sm:text-sm">
      <div className="grid grid-cols-[1.4fr_0.7fr_0.7fr_0.7fr] px-3 sm:px-4 py-2.5 bg-neutral-950/95 text-neutral-500 text-[11px] uppercase tracking-wide">
        <div>Менеджер</div>
        <div>Звонков</div>
        <div>DONE</div>
        <div>Средний score</div>
      </div>

      <div className="max-h-64 w-full overflow-auto">
        {managers.map((m) => (
          <div
            key={m.managerId}
            className="grid grid-cols-[1.4fr_0.7fr_0.7fr_0.7fr] items-center px-3 sm:px-4 py-2.5 border-t border-neutral-900 text-neutral-200 hover:bg-neutral-900/70 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-[11px] text-neutral-200">
                {m.name?.[0]?.toUpperCase() || "M"}
              </div>
              <span className="truncate">{m.name}</span>
            </div>
            <div>{m.total}</div>
            <div>{m.done}</div>
            <div>
              {typeof m.avgScore === "number"
                ? `${m.avgScore.toFixed(0)}/100`
                : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===== ИНСАЙТЫ ===== */

function InsightCard(props: { title: string; points: string[] }) {
  return (
    <div className="rounded-3xl border border-neutral-900 bg-neutral-950/95 p-5 sm:p-6 flex flex-col gap-3 shadow-[0_18px_50px_rgba(0,0,0,0.9)]">
      <h3 className="text-sm font-medium text-neutral-100">
        {props.title}
      </h3>
      <ul className="space-y-2 text-[11px] sm:text-[12px] text-neutral-400">
        {props.points.map((p, idx) => (
          <li key={idx} className="flex gap-2">
            <span className="mt-[6px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-400" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
