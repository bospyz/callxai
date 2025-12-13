// src/app/(app)/app/analytics/page.tsx
"use client";

import React from "react";
import { motion } from "framer-motion";

type ScoreBucket = { label: string; from: number; to: number; count: number };

type DailyPoint = {
  date: string; // YYYY-MM-DD
  total: number;
  done: number;
  error: number;
  processing: number;
};

type ManagerExcelRow = {
  managerId: string;
  name: string;

  callsTotal: number;
  callsDone: number;
  errorCalls: number;
  processingCalls: number;

  avgScore100: number | null;

  greetingAvg10: number | null;
  needsAvg10: number | null;
  presentationAvg10: number | null;
  objectionsAvg10: number | null;
  closingAvg10: number | null;

  talkRatioAvg: number | null;

  doneRate: number;
  errorRate: number;
};

type TopCall = {
  callId: string;
  occurredAt: string | null;
  managerName: string;
  direction: "INBOUND" | "OUTBOUND" | "—";
  durationSec: number | null;
  pipelineName: string | null;
  stageName: string | null;
  leadName: string | null;
  totalScore: number;
};

type Dashboard = {
  days: number;

  totalCalls: number;
  doneCalls: number;
  errorCalls: number;
  processingCalls: number;

  inboundCalls: number;
  outboundCalls: number;

  avgScore: number | null;

  daily: DailyPoint[];
  scoreBuckets: ScoreBucket[];
  managerTable: ManagerExcelRow[];
  topIssues: { text: string; count: number }[];

  topCallsByScore: TopCall[];
  worstCallsByScore: TopCall[];
};

export default function AnalyticsPage() {
  const [dash, setDash] = React.useState<Dashboard | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const days = 30;

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/analytics/dashboard?days=${days}`);
        if (!res.ok) throw new Error("Failed to load analytics dashboard");

        const data = await res.json();
        if (cancelled) return;

        setDash(data.dashboard ?? null);
      } catch (e: any) {
        console.error("[Analytics] dashboard load error", e);
        if (!cancelled) setError(e?.message ?? "Ошибка загрузки аналитики");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasAnyData = !!dash && (dash.totalCalls > 0 || dash.managerTable.length > 0);
  const withAnalytics = !loading && !error && hasAnyData;

  const total = dash?.totalCalls ?? 0;
  const done = dash?.doneCalls ?? 0;
  const errorsCount = dash?.errorCalls ?? 0;
  const processing = dash?.processingCalls ?? 0;

  const avgScore = dash?.avgScore ?? null;

  const doneRate = total > 0 ? Math.round((done * 100) / total) : 0;
  const errorRate = total > 0 ? Math.round((errorsCount * 100) / total) : 0;
  const queueRate = total > 0 ? Math.round((processing * 100) / total) : 0;

  const bestByVolume = dash?.managerTable?.[0];
  const bestByScore = dash?.managerTable
    ?.filter((m) => typeof m.avgScore100 === "number")
    ?.sort((a, b) => (b.avgScore100 ?? 0) - (a.avgScore100 ?? 0))?.[0];

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
                данные за последние {days} дней
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight">
              Аналитика по звонкам
            </h1>
            <p className="max-w-2xl text-sm text-neutral-400">
              Дашборд “как Excel”: динамика по дням, распределение score, таблица менеджеров с метриками,
              топ-звонки и топ-проблемы.
            </p>
          </div>

          {withAnalytics && (
            <div className="flex flex-col items-start md:items-end gap-1.5 text-xs text-neutral-500">
              <div>
                Всего звонков за {days} дней:{" "}
                <span className="font-semibold text-neutral-100">{total}</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-neutral-950/80 border border-neutral-800 px-3 py-1 text-[11px]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>Агрегации считаются на сервере</span>
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
                <p className="text-sm">Подгружаем Excel-дашборд…</p>
                <p className="mt-1 text-[11px] text-neutral-500">
                  Метрики, дневная динамика, топ-звонки и таблица менеджеров.
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

        {/* NO DATA */}
        {!loading && !error && !hasAnyData && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-neutral-800 bg-neutral-950/90 p-5 text-sm text-neutral-300"
          >
            <h2 className="text-base font-medium mb-1.5">Пока нет данных</h2>
            <p className="text-[12px] text-neutral-500 max-w-xl">
              Подключи интеграцию, налей первые звонки и включи скоринг (CallScore) —
              после этого появятся графики и таблица “как Excel”.
            </p>
          </motion.div>
        )}

        {/* CONTENT */}
        {withAnalytics && dash && (
          <>
            {/* TOP METRICS */}
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
            >
              <MetricCard label="Всего звонков" value={total} hint={`За ${days} дней`} tone="default" />
              <MetricCard label="DONE — разобрано" value={done} delta={doneRate} hint="Готовый разбор/скоринг" tone="good" />
              <MetricCard label="В очереди" value={processing} delta={queueRate} hint="NEW + PROCESSING" tone="warn" />
              <MetricCard label="ERROR" value={errorsCount} delta={errorRate} hint="Проблемы с обработкой" tone="danger" />
            </motion.section>

            {/* SECOND ROW */}
            <section className="grid gap-4 lg:grid-cols-[1.5fr,1.1fr]">
              <ScoreCard avgScore={avgScore} inbound={dash.inboundCalls} outbound={dash.outboundCalls} />
              <StatusCard total={total} done={done} processing={processing} errors={errorsCount} />
            </section>

            {/* THIRD ROW: Daily + Score distribution */}
            <section className="grid gap-4 xl:grid-cols-[1.6fr,1.1fr]">
              <DailyChartCard daily={dash.daily} />
              <ScoreBucketsCard buckets={dash.scoreBuckets} />
            </section>

            {/* FOURTH ROW: Top calls + Issues */}
            <section className="grid gap-4 xl:grid-cols-2">
              <TopCallsCard title="Топ звонки по score" calls={dash.topCallsByScore} />
              <TopCallsCard title="Худшие звонки по score" calls={dash.worstCallsByScore} />
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.35fr,1fr]">
              <ManagersExcelCard managers={dash.managerTable} bestByVolume={bestByVolume} bestByScore={bestByScore} />
              <TopIssuesCard items={dash.topIssues} />
            </section>

            {/* INSIGHTS */}
            <section className="grid gap-4 lg:grid-cols-3">
              <InsightCard
                title="Что делать сейчас"
                points={[
                  `Сначала вычисти ERROR — это тормозит весь отчёт и портит доверие к цифрам.`,
                  `Проверь худшие звонки: у кого низкий score + низкий closing — там чаще всего нет следующего шага.`,
                  `Собери “плейлист” топ-звонков и сделай тренинг на лучших примерах.`,
                ]}
              />
              <InsightCard
                title="Как читать Excel-таблицу менеджеров"
                points={[
                  `CallsTotal — объём. DoneRate — дисциплина обработки. ErrorRate — технические проблемы.`,
                  `AvgScore — качество общения. Метрики 0–10 показывают, где провал: needs/objections/closing.`,
                  `TalkRatio — баланс речи. Если менеджер говорит 85–95% — часто не задаёт вопросы.`,
                ]}
              />
              <InsightCard
                title="План улучшения на неделю"
                points={[
                  `День 1–2: ошибки (ERROR) и очередь (PROCESSING).`,
                  `День 3–4: улучшить needs + objections у 2–3 менеджеров с худшими метриками.`,
                  `День 5: разбор топ-звонков и закрепление скрипта.`,
                ]}
              />
            </section>
          </>
        )}
      </div>
    </main>
  );
}

/* ===== UI blocks ===== */

type MetricTone = "default" | "good" | "warn" | "danger";

function MetricCard(props: { label: string; value: number; hint?: string; delta?: number; tone?: MetricTone }) {
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
    <div className={`rounded-2xl border px-4 py-4 sm:px-5 sm:py-5 shadow-[0_16px_45px_rgba(0,0,0,0.85)] ${toneClasses[tone]}`}>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-500">{props.label}</p>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-3xl sm:text-4xl font-semibold text-neutral-50">{props.value ?? 0}</div>
        {typeof props.delta === "number" && (
          <div className={`inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[10px] ${deltaColor}`}>
            <span>{props.delta}%</span>
          </div>
        )}
      </div>
      {props.hint && <p className="mt-2 text-[11px] text-neutral-500">{props.hint}</p>}
    </div>
  );
}

function ScoreCard(props: { avgScore: number | null; inbound: number; outbound: number }) {
  const { avgScore, inbound, outbound } = props;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="relative overflow-hidden rounded-3xl border border-neutral-900 bg-neutral-950/95 p-5 sm:p-6 shadow-[0_20px_55px_rgba(0,0,0,0.9)]"
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.2] bg-[radial-gradient(circle_at_1px_1px,#ffffff22_1px,transparent_0)] [background-size:18px_18px]" />
      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Средний score отдела</p>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-4xl sm:text-5xl font-semibold text-emerald-400">
              {typeof avgScore === "number" ? avgScore.toFixed(1) : "--"}
            </span>
            <span className="text-sm text-neutral-500">/ 100</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-neutral-500">
            <span className="rounded-full border border-neutral-800 bg-neutral-950/80 px-2 py-1">
              INBOUND: <span className="text-neutral-200">{inbound}</span>
            </span>
            <span className="rounded-full border border-neutral-800 bg-neutral-950/80 px-2 py-1">
              OUTBOUND: <span className="text-neutral-200">{outbound}</span>
            </span>
          </div>

          <p className="mt-3 text-xs text-neutral-400 max-w-md">
            Score строится по CallScore.totalScore и детальным метрикам 0–10 (приветствие, потребность, возражения, закрытие).
          </p>
        </div>

        <div className="mt-3 sm:mt-0 w-full max-w-xs">
          <div className="mb-1 flex items-center justify-between text-[11px] text-neutral-500">
            <span>Уровень команды</span>
            <span>
              {typeof avgScore === "number" && avgScore < 60
                ? "Ниже нормы"
                : typeof avgScore === "number" && avgScore < 80
                ? "Средний"
                : "Сильный"}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-neutral-900 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400"
              style={{ width: `${typeof avgScore === "number" ? Math.min(avgScore, 100) : 0}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-neutral-500">
            <span>&lt; 60</span>
            <span>60–80</span>
            <span>&gt; 80</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function StatusRow(props: { label: string; count: number; total: number; tone: "good" | "warn" | "danger" }) {
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
          {count} {total > 0 && <span className="text-neutral-500">· {percent}%</span>}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-neutral-900 overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${barClass}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function StatusCard(props: { total: number; done: number; processing: number; errors: number }) {
  const { total, done, processing, errors } = props;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-3xl border border-neutral-900 bg-neutral-950/95 p-5 sm:p-6 flex flex-col gap-4 shadow-[0_20px_55px_rgba(0,0,0,0.9)]"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-100">Статусы звонков</h2>
      </div>

      <StatusRow label="DONE — разобрано" count={done} total={total} tone="good" />
      <StatusRow label="NEW / PROCESSING — очередь" count={processing} total={total} tone="warn" />
      <StatusRow label="ERROR — проблемы" count={errors} total={total} tone="danger" />

      <p className="mt-1 text-[11px] text-neutral-500">
        Чем меньше очередь и ERROR — тем стабильнее обработка и точнее аналитика “как Excel”.
      </p>
    </motion.div>
  );
}

function DailyChartCard({ daily }: { daily: DailyPoint[] }) {
  const points = [...daily].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const maxTotal = points.length > 0 ? Math.max(...points.map((p) => p.total || 0)) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
      className="rounded-3xl border border-neutral-900 bg-neutral-950/95 p-5 sm:p-6 flex flex-col shadow-[0_20px_55px_rgba(0,0,0,0.9)]"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-neutral-100">Динамика по дням</h2>
        <span className="text-[11px] text-neutral-500">Столбики: total, зелёное: DONE, красное: ERROR</span>
      </div>

      {points.length === 0 ? (
        <p className="text-[12px] text-neutral-500">Нет данных для графика.</p>
      ) : (
        <div className="mt-2 h-56 w-full rounded-2xl bg-neutral-950 border border-neutral-900 px-3 py-3 flex flex-col justify-between">
          <div className="flex-1 flex items-end gap-2">
            {points.map((p) => {
              const height = maxTotal > 0 ? (p.total / maxTotal) * 100 : 0;
              const doneHeight = maxTotal > 0 ? (p.done / maxTotal) * 100 : 0;
              const errorHeight = maxTotal > 0 ? (p.error / maxTotal) * 100 : 0;

              const label = new Date(p.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });

              return (
                <div key={p.date} className="flex-1 flex flex-col items-center justify-end gap-1">
                  <div className="relative w-full max-w-[22px] flex-1 flex items-end justify-center">
                    <div className="w-full rounded-t-full bg-gradient-to-t from-neutral-800 to-neutral-700" style={{ height: `${height || 3}%` }} />
                    <div className="absolute bottom-0 w-[62%] rounded-t-full bg-gradient-to-t from-emerald-400 to-lime-300 shadow-[0_0_12px_rgba(74,222,128,0.65)]" style={{ height: `${doneHeight || 0}%` }} />
                    <div className="absolute bottom-0 w-[35%] translate-x-[10px] rounded-t-full bg-gradient-to-t from-red-500 to-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.55)]" style={{ height: `${errorHeight || 0}%` }} />
                  </div>
                  <span className="text-[10px] text-neutral-500">{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function ScoreBucketsCard({ buckets }: { buckets: ScoreBucket[] }) {
  const max = buckets.length ? Math.max(...buckets.map((b) => b.count)) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.13 }}
      className="rounded-3xl border border-neutral-900 bg-neutral-950/95 p-5 sm:p-6 shadow-[0_20px_55px_rgba(0,0,0,0.9)]"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-neutral-100">Распределение score</h2>
        <span className="text-[11px] text-neutral-500">Сколько звонков попало в диапазон</span>
      </div>

      {buckets.length === 0 ? (
        <p className="text-[12px] text-neutral-500">Нет score для распределения.</p>
      ) : (
        <div className="space-y-2">
          {buckets.map((b) => {
            const w = max > 0 ? Math.round((b.count * 100) / max) : 0;
            return (
              <div key={b.label} className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-neutral-400">
                  <span>{b.label}</span>
                  <span className="text-neutral-300">{b.count}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-neutral-900 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300" style={{ width: `${w}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

function TopCallsCard({ title, calls }: { title: string; calls: TopCall[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.14 }}
      className="rounded-3xl border border-neutral-900 bg-neutral-950/95 p-5 sm:p-6 shadow-[0_20px_55px_rgba(0,0,0,0.9)]"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-neutral-100">{title}</h2>
        <span className="text-[11px] text-neutral-500">Score + контекст (воронка/стадия)</span>
      </div>

      {calls.length === 0 ? (
        <p className="text-[12px] text-neutral-500">Нет звонков со score.</p>
      ) : (
        <div className="space-y-2">
          {calls.map((c) => (
            <div key={c.callId} className="rounded-2xl border border-neutral-900 bg-neutral-950/90 p-3 hover:bg-neutral-900/60 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[12px] text-neutral-100 font-medium">
                    {c.managerName}{" "}
                    <span className="text-neutral-500 font-normal">
                      · {c.direction}{c.durationSec != null ? ` · ${Math.round(c.durationSec)}s` : ""}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-neutral-500">
                    {c.pipelineName ? `Воронка: ${c.pipelineName}` : "Воронка: —"}
                    {c.stageName ? ` · Стадия: ${c.stageName}` : " · Стадия: —"}
                    {c.leadName ? ` · Лид: ${c.leadName}` : ""}
                  </div>
                </div>
                <div className="text-[12px] font-semibold text-emerald-300">
                  {c.totalScore}/100
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function ManagersExcelCard(props: {
  managers: ManagerExcelRow[];
  bestByVolume?: ManagerExcelRow;
  bestByScore?: ManagerExcelRow;
}) {
  const { managers, bestByVolume, bestByScore } = props;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="rounded-3xl border border-neutral-900 bg-neutral-950/95 p-5 sm:p-6 shadow-[0_20px_55px_rgba(0,0,0,0.9)]"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-neutral-100">Менеджеры — Excel таблица</h2>
          <p className="mt-1 text-[11px] text-neutral-500">
            Объём, DONE/ERROR, AvgScore и детальные метрики 0–10.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MiniLeader
          title="Лидер по объёму"
          row={bestByVolume}
          badge="🏆"
          hint="Максимум звонков"
        />
        <MiniLeader
          title="Лидер по качеству"
          row={bestByScore}
          badge="💬"
          hint="Максимальный AvgScore"
        />
      </div>

      <div className="mt-4 rounded-2xl border border-neutral-900 bg-neutral-950/90 overflow-hidden">
        <div className="grid grid-cols-[1.2fr_.55fr_.55fr_.55fr_.75fr_.65fr_.65fr_.65fr_.65fr_.65fr_.65fr] px-3 sm:px-4 py-2.5 bg-neutral-950/95 text-neutral-500 text-[11px] uppercase tracking-wide">
          <div>Менеджер</div>
          <div>Calls</div>
          <div>DONE</div>
          <div>ERROR</div>
          <div>AvgScore</div>
          <div>Greet</div>
          <div>Needs</div>
          <div>Pres</div>
          <div>Obj</div>
          <div>Close</div>
          <div>Talk%</div>
        </div>

        <div className="max-h-[420px] w-full overflow-auto">
          {managers.map((m) => (
            <div
              key={m.managerId}
              className="grid grid-cols-[1.2fr_.55fr_.55fr_.55fr_.75fr_.65fr_.65fr_.65fr_.65fr_.65fr_.65fr] items-center px-3 sm:px-4 py-2.5 border-t border-neutral-900 text-neutral-200 hover:bg-neutral-900/60 transition-colors text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-7 w-7 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-[11px] text-neutral-200">
                  {m.name?.[0]?.toUpperCase() || "M"}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-neutral-100">{m.name}</div>
                  <div className="truncate text-[10px] text-neutral-500">
                    DONE {m.doneRate}% · ERROR {m.errorRate}%
                  </div>
                </div>
              </div>

              <div>{m.callsTotal}</div>
              <div>{m.callsDone}</div>
              <div className="text-red-200">{m.errorCalls}</div>

              <div className="font-semibold text-emerald-200">
                {typeof m.avgScore100 === "number" ? m.avgScore100.toFixed(1) : "—"}
              </div>

              <Cell10 v={m.greetingAvg10} />
              <Cell10 v={m.needsAvg10} />
              <Cell10 v={m.presentationAvg10} />
              <Cell10 v={m.objectionsAvg10} />
              <Cell10 v={m.closingAvg10} />

              <div className="text-neutral-200">
                {typeof m.talkRatioAvg === "number" ? `${m.talkRatioAvg}%` : "—"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function MiniLeader(props: { title: string; row?: ManagerExcelRow; badge: string; hint: string }) {
  const r = props.row;
  return (
    <div className="rounded-2xl border border-neutral-900 bg-neutral-950/90 p-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">{props.title}</div>
        <div className="text-[11px] text-neutral-400">{props.badge}</div>
      </div>
      {!r ? (
        <div className="mt-2 text-[12px] text-neutral-500">Нет данных</div>
      ) : (
        <div className="mt-2">
          <div className="text-sm font-medium text-neutral-50 truncate">{r.name}</div>
          <div className="mt-1 text-[11px] text-neutral-500">
            {props.hint}: <span className="text-neutral-200">{r.callsTotal}</span>
            {" · "}
            AvgScore: <span className="text-emerald-200">{typeof r.avgScore100 === "number" ? r.avgScore100.toFixed(1) : "—"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Cell10({ v }: { v: number | null }) {
  const val = typeof v === "number" ? v : null;
  const tone =
    val == null ? "text-neutral-500" : val >= 8 ? "text-emerald-200" : val >= 6 ? "text-amber-200" : "text-rose-200";

  return <div className={tone}>{val != null ? val.toFixed(1) : "—"}</div>;
}

function TopIssuesCard({ items }: { items: { text: string; count: number }[] }) {
  const max = items.length ? Math.max(...items.map((x) => x.count)) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.16 }}
      className="rounded-3xl border border-neutral-900 bg-neutral-950/95 p-5 sm:p-6 shadow-[0_20px_55px_rgba(0,0,0,0.9)]"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-neutral-100">Top AI Issues</h2>
        <span className="text-[11px] text-neutral-500">Частые проблемы по звонкам</span>
      </div>

      {items.length === 0 ? (
        <p className="text-[12px] text-neutral-500">Пока нет issues.</p>
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const w = max > 0 ? Math.round((it.count * 100) / max) : 0;
            return (
              <div key={it.text} className="rounded-2xl border border-neutral-900 bg-neutral-950/90 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[12px] text-neutral-200 break-words">{it.text}</div>
                  <div className="text-[12px] font-semibold text-neutral-100">{it.count}</div>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-neutral-900 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-300" style={{ width: `${w}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

function InsightCard(props: { title: string; points: string[] }) {
  return (
    <div className="rounded-3xl border border-neutral-900 bg-neutral-950/95 p-5 sm:p-6 flex flex-col gap-3 shadow-[0_18px_50px_rgba(0,0,0,0.9)]">
      <h3 className="text-sm font-medium text-neutral-100">{props.title}</h3>
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
