"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Summary = {
  ok: boolean;
  period: string;
  kpi: {
    totalCalls: number;
    doneCalls: number;
    inQueue: number;
    processingCalls: number;
    newCalls: number;
    errorCalls: number;
    errorRate: number;
    scoredCallsCount: number;
    lowScoreCount: number;
    midScoreCount: number;
    highScoreCount: number;
    avgScore: number | null;
  };
  sentiment: { positive: number; neutral: number; negative: number };
  topManagers: { id: string; name: string; calls: number; avgScore: number | null }[];
  daily: { day: string; total: number; done: number }[];
  deep: {
    avgMetrics: Record<string, number | null>;
    avgManagerSpeechPercent: number | null;
    topIssues: { text: string; count: number }[];
    sampleSize: number;
  };
};

function clamp(n: number, a = 0, b = 100) {
  return Math.max(a, Math.min(b, n));
}

export default function AnalyticsDashboardClient({ period = "30d" }: { period?: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics/summary?period=${period}`, { cache: "no-store" });
      const json = (await res.json()) as Summary;
      setData(json.ok ? json : null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    // “реалтайм”: обновляем каждые 12 сек
    const t = setInterval(load, 12_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const avgScore = data?.kpi.avgScore ?? null;

  const teamLevel = useMemo(() => {
    if (avgScore == null) return { label: "Скоринг пока не посчитан", tone: "neutral" as const, pct: 0 };
    if (avgScore < 60) return { label: "Ниже нормы", tone: "danger" as const, pct: 35 };
    if (avgScore < 80) return { label: "Средний уровень", tone: "warn" as const, pct: 65 };
    return { label: "Топ-уровень", tone: "good" as const, pct: 90 };
  }, [avgScore]);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* KPI ROW */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Всего звонков" value={loading ? "—" : data?.kpi.totalCalls ?? "—"} />
        <KpiCard label="DONE — разобрано" value={loading ? "—" : data?.kpi.doneCalls ?? "—"} tone="good" hint={loading ? "" : pct(data?.kpi.doneCalls, data?.kpi.totalCalls)} />
        <KpiCard label="В очереди / обработке" value={loading ? "—" : data?.kpi.inQueue ?? "—"} tone="warn" hint={loading ? "" : pct(data?.kpi.inQueue, data?.kpi.totalCalls)} />
        <KpiCard label="Ошибки анализа" value={loading ? "—" : data?.kpi.errorCalls ?? "—"} tone="danger" hint={loading ? "" : `${data?.kpi.errorRate ?? 0}%`} />
      </div>

      {/* AVG SCORE BIG */}
      <Panel>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] sm:text-xs text-neutral-500">Средний score отдела</div>
            <div className="mt-1 text-3xl sm:text-4xl font-semibold text-emerald-300">
              {loading ? "—" : avgScore != null ? `${avgScore}` : "—"}
              <span className="text-neutral-600 text-base sm:text-lg">/100</span>
            </div>
            <div className="mt-2 text-xs sm:text-sm text-neutral-400 max-w-xl">
              Чем выше score, тем лучше работа по скрипту: приветствие, выявление потребностей,
              возражения, закрытие на следующий шаг.
            </div>
          </div>

          <div className="min-w-[220px] hidden md:block">
            <div className="text-[11px] text-neutral-500">Уровень команды</div>
            <div className="mt-2">
              <ScoreGauge pct={teamLevel.pct} tone={teamLevel.tone} />
              <div className="mt-2 text-xs text-neutral-400">{teamLevel.label}</div>
              <div className="mt-1 text-[11px] text-neutral-600">&lt;60 — тревога • 60–80 — средне • 80+ — топ</div>
            </div>
          </div>
        </div>
      </Panel>

      {/* STATUS BARS */}
      <Panel title="Статусы звонков">
        <div className="space-y-3">
          <StatusBar label="DONE — разобрано" value={loading ? 0 : data?.kpi.doneCalls ?? 0} total={loading ? 1 : data?.kpi.totalCalls ?? 1} tone="good" />
          <StatusBar label="NEW + PROCESSING — в очереди" value={loading ? 0 : data?.kpi.inQueue ?? 0} total={loading ? 1 : data?.kpi.totalCalls ?? 1} tone="warn" />
          <StatusBar label="ERROR — проблемы" value={loading ? 0 : data?.kpi.errorCalls ?? 0} total={loading ? 1 : data?.kpi.totalCalls ?? 1} tone="danger" />
        </div>
        <div className="mt-3 text-[11px] text-neutral-600">
          Цель — увеличивать DONE и держать очередь под контролем. Чем меньше ERROR, тем выше доверие к данным.
        </div>
      </Panel>

      {/* DAILY CHART */}
      <Panel title="Динамика звонков по дням" rightNote="Столбики: всего • заполнение: DONE">
        <DailyBars loading={loading} series={data?.daily ?? []} />
      </Panel>

      {/* DEEP ANALYTICS */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 xl:grid-cols-3">
        <Panel title="Качество по этапам (avg 0–10)">
          <MetricBars loading={loading} metrics={data?.deep.avgMetrics ?? {}} />
          <div className="mt-3 text-[11px] text-neutral-600">
            Расчёт по выборке последних <span className="text-neutral-400">{data?.deep.sampleSize ?? 0}</span> DONE-звонков за период.
          </div>
        </Panel>

        <Panel title="Тон клиента (sentiment)">
          <SentimentBlock loading={loading} s={data?.sentiment ?? { positive: 0, neutral: 0, negative: 0 }} />
          <div className="mt-3 text-[11px] text-neutral-600">
            Это помогает видеть качество входящего трафика и реакции на скрипт.
          </div>
        </Panel>

        <Panel title="Топ проблем (aiIssues)">
          <IssuesList loading={loading} items={data?.deep.topIssues ?? []} />
          <div className="mt-3 text-[11px] text-neutral-600">
            Следующий шаг: вынести частые проблемы в чек-лист обучения и контроля.
          </div>
        </Panel>
      </div>

      {/* TOP MANAGERS */}
      <Panel title="Топ менеджеров по количеству звонков">
        <ManagersTable loading={loading} rows={data?.topManagers ?? []} />
      </Panel>
    </div>
  );
}

function pct(a?: number, b?: number) {
  const A = a ?? 0;
  const B = b ?? 0;
  if (B <= 0) return "0%";
  return `${Math.round((A * 100) / B)}%`;
}

function Panel({ title, rightNote, children }: { title?: string; rightNote?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4 sm:p-5 shadow-[0_18px_45px_rgba(0,0,0,0.75)]">
      {(title || rightNote) && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm sm:text-base font-semibold text-neutral-200">{title}</div>
          {rightNote && <div className="text-[11px] text-neutral-600">{rightNote}</div>}
        </div>
      )}
      <div className={title ? "mt-3" : ""}>{children}</div>
    </div>
  );
}

function KpiCard({
  label, value, hint, tone = "neutral",
}: {
  label: string;
  value: any;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "danger";
}) {
  const cls =
    tone === "good"
      ? "border-emerald-500/35 bg-emerald-500/5"
      : tone === "warn"
      ? "border-amber-500/35 bg-amber-500/5"
      : tone === "danger"
      ? "border-red-500/35 bg-red-500/5"
      : "border-neutral-900 bg-neutral-950/60";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35 }}
      className={`rounded-2xl border ${cls} p-4`}
    >
      <div className="text-[11px] text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-neutral-50">{value}</div>
      {hint ? <div className="mt-1 text-[11px] text-neutral-600">{hint}</div> : null}
    </motion.div>
  );
}

function ScoreGauge({ pct, tone }: { pct: number; tone: "neutral" | "good" | "warn" | "danger" }) {
  const bar =
    tone === "good" ? "bg-emerald-400" : tone === "warn" ? "bg-amber-400" : tone === "danger" ? "bg-red-400" : "bg-neutral-600";

  return (
    <div className="h-2.5 rounded-full bg-neutral-900 overflow-hidden border border-neutral-800">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${clamp(pct)}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={`h-full ${bar}`}
      />
    </div>
  );
}

function StatusBar({
  label, value, total, tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "good" | "warn" | "danger";
}) {
  const pctVal = total > 0 ? Math.round((value * 100) / total) : 0;
  const bar = tone === "good" ? "bg-emerald-400" : tone === "warn" ? "bg-amber-400" : "bg-red-400";

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <div>{label}</div>
        <div className="text-neutral-400">{value} • {pctVal}%</div>
      </div>
      <div className="mt-2 h-2.5 rounded-full bg-neutral-900 border border-neutral-800 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${clamp(pctVal)}%` }}
          transition={{ duration: 0.6 }}
          className={`h-full ${bar}`}
        />
      </div>
    </div>
  );
}

function DailyBars({ loading, series }: { loading: boolean; series: { day: string; total: number; done: number }[] }) {
  const max = useMemo(() => Math.max(1, ...series.map(s => s.total)), [series]);

  if (loading) {
    return <div className="h-[140px] rounded-xl bg-neutral-900/40 animate-pulse" />;
  }

  return (
    <div className="h-[160px] flex items-end gap-1.5">
      {series.map((p) => {
        const h = Math.round((p.total * 150) / max);
        const doneH = p.total > 0 ? Math.round((p.done * h) / p.total) : 0;

        return (
          <div key={p.day} className="flex-1 min-w-[6px]">
            <div className="relative w-full rounded-md bg-neutral-900/70 overflow-hidden" style={{ height: h }}>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: doneH }}
                transition={{ duration: 0.5 }}
                className="absolute bottom-0 left-0 right-0 bg-emerald-400/80"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MetricBars({ loading, metrics }: { loading: boolean; metrics: Record<string, number | null> }) {
  const order = [
    ["greeting", "Приветствие"],
    ["needs", "Потребности"],
    ["presentation", "Презентация"],
    ["price", "Цена"],
    ["objections", "Возражения"],
    ["closing", "Закрытие"],
    ["empathy", "Эмпатия"],
    ["clarity", "Ясность"],
    ["reaction", "Реакция"],
    ["length", "Длина"],
  ] as const;

  if (loading) return <div className="h-[220px] rounded-xl bg-neutral-900/40 animate-pulse" />;

  return (
    <div className="space-y-2.5">
      {order.map(([k, label]) => {
        const v = metrics?.[k];
        const pctVal = v != null ? clamp(Math.round((v * 100) / 10)) : 0;

        return (
          <div key={k}>
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <div>{label}</div>
              <div className="text-neutral-400">{v != null ? `${v}/10` : "—"}</div>
            </div>
            <div className="mt-1.5 h-2.5 rounded-full bg-neutral-900 border border-neutral-800 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pctVal}%` }}
                transition={{ duration: 0.55 }}
                className="h-full bg-emerald-400/70"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SentimentBlock({ loading, s }: { loading: boolean; s: { positive: number; neutral: number; negative: number } }) {
  if (loading) return <div className="h-[140px] rounded-xl bg-neutral-900/40 animate-pulse" />;

  const total = s.positive + s.neutral + s.negative || 1;

  return (
    <div className="space-y-2">
      <Row label="Positive" val={`${s.positive} • ${Math.round((s.positive * 100) / total)}%`} />
      <Row label="Neutral" val={`${s.neutral} • ${Math.round((s.neutral * 100) / total)}%`} />
      <Row label="Negative" val={`${s.negative} • ${Math.round((s.negative * 100) / total)}%`} />
      <div className="mt-3 h-2.5 rounded-full bg-neutral-900 border border-neutral-800 overflow-hidden">
        <div className="h-full flex">
          <div style={{ width: `${Math.round((s.positive * 100) / total)}%` }} className="bg-emerald-400/70" />
          <div style={{ width: `${Math.round((s.neutral * 100) / total)}%` }} className="bg-neutral-400/35" />
          <div style={{ width: `${Math.round((s.negative * 100) / total)}%` }} className="bg-red-400/60" />
        </div>
      </div>
    </div>
  );
}

function IssuesList({ loading, items }: { loading: boolean; items: { text: string; count: number }[] }) {
  if (loading) return <div className="h-[200px] rounded-xl bg-neutral-900/40 animate-pulse" />;

  if (!items.length) return <div className="text-sm text-neutral-500">Пока нет накопленных aiIssues.</div>;

  return (
    <div className="space-y-2">
      {items.map((x, i) => (
        <div key={i} className="flex items-start justify-between gap-3 text-sm">
          <div className="text-neutral-300">{x.text}</div>
          <div className="text-neutral-600 text-xs mt-0.5">{x.count}</div>
        </div>
      ))}
    </div>
  );
}

function ManagersTable({ loading, rows }: { loading: boolean; rows: { id: string; name: string; calls: number; avgScore: number | null }[] }) {
  if (loading) return <div className="h-[180px] rounded-xl bg-neutral-900/40 animate-pulse" />;

  if (!rows.length) return <div className="text-sm text-neutral-500">Нет звонков с привязкой к managerId.</div>;

  return (
    <div className="-mx-4 sm:mx-0 overflow-x-auto">
      <div className="min-w-[520px] rounded-2xl border border-neutral-900 overflow-hidden">
        <div className="grid grid-cols-3 px-4 py-2.5 bg-neutral-950 text-xs text-neutral-500">
          <div>Менеджер</div>
          <div className="text-right">Звонков</div>
          <div className="text-right">Avg score</div>
        </div>
        {rows.map((m) => (
          <div key={m.id} className="grid grid-cols-3 px-4 py-2.5 border-t border-neutral-900 text-sm text-neutral-300">
            <div className="truncate">{m.name}</div>
            <div className="text-right">{m.calls}</div>
            <div className="text-right">{m.avgScore != null ? `${m.avgScore}/100` : "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, val }: { label: string; val: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="text-neutral-500">{label}</div>
      <div className="text-neutral-300">{val}</div>
    </div>
  );
}
