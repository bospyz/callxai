// src/app/(app)/app/page.tsx

"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

type CallItem = {
  id: string;
  status: string;
  score: number | null;
  createdAt: string;
  managerName?: string;
  manager?: { name?: string };
  [key: string]: any;
};

type ManagerStat = {
  name: string;
  total: number;
  done: number;
  avgScore: number;
};

const PERIOD_OPTIONS: { value: string; label: string }[] = [
  { value: "7d", label: "7 дней" },
  { value: "30d", label: "30 дней" },
  { value: "90d", label: "90 дней" },
  { value: "365d", label: "Все (365 дней)" },
];

export default function AppDashboardPage() {
  const [period, setPeriod] = useState<string>("7d");
  const [calls, setCalls] = useState<CallItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  const [currentInsight, setCurrentInsight] = useState(0);

  // Загрузка звонков по выбранному периоду
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
        console.error("App dashboard load error", e);
        setError(e?.message ?? "Ошибка загрузки данных");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [period]);

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

  const hasCalls = totalCalls > 0;

  // Сводка по менеджерам
  const managerStats: ManagerStat[] = useMemo(() => {
    const map = new Map<
      string,
      { total: number; done: number; scoreSum: number; scoreCount: number }
    >();

    for (const c of calls) {
      const name =
        (c.managerName as string) ||
        (c.manager?.name as string) ||
        (c as any).manager_name ||
        "Без менеджера";

      if (!map.has(name)) {
        map.set(name, { total: 0, done: 0, scoreSum: 0, scoreCount: 0 });
      }
      const entry = map.get(name)!;
      entry.total += 1;
      if (c.status === "DONE") entry.done += 1;
      if (typeof c.score === "number") {
        entry.scoreSum += c.score;
        entry.scoreCount += 1;
      }
    }

    const stats: ManagerStat[] = Array.from(map.entries()).map(
      ([name, v]) => ({
        name,
        total: v.total,
        done: v.done,
        avgScore:
          v.scoreCount > 0 ? Math.round(v.scoreSum / v.scoreCount) : 0,
      })
    );

    stats.sort((a, b) => b.total - a.total);
    return stats;
  }, [calls]);

  const topManagers = managerStats.slice(0, 5);

  // Немного доп. агрегаций для советов
  const failedCalls = calls.filter((c) => c.status === "FAILED").length;
  const newCalls = calls.filter((c) => c.status === "NEW").length;
  const processingCalls = calls.filter(
    (c) => c.status === "PROCESSING"
  ).length;

  const bestByVolume = managerStats[0];
  const bestByScore = [...managerStats]
    .filter((m) => m.avgScore > 0)
    .sort((a, b) => b.avgScore - a.avgScore)[0];

  // Последние 5 звонков
  const latestCalls = [...calls]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 5);

  // Экспорт Excel по ТЕКУЩЕМУ периоду
  async function handleExportExcel() {
    try {
      setExportLoading(true);
      const res = await fetch(`/api/calls/export?period=${period}`);
      if (!res.ok) {
        console.error("Export error", await res.text());
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const periodLabel =
        PERIOD_OPTIONS.find((p) => p.value === period)?.label || period;

      a.download = `callx_calls_${periodLabel.replace(/\s+/g, "_")}.csv`;

      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export error", e);
    } finally {
      setExportLoading(false);
    }
  }

  // ---------- СТОРИС-КАРТОЧКИ / СЛАЙДЕР ИНСАЙТОВ ----------
  type InsightSlide = {
    id: string;
    badge: string;
    title: string;
    subtitle: string;
    description: string;
    tone?: "danger" | "ok" | "good";
  };

  const insightSlides: InsightSlide[] = useMemo(() => {
    if (!hasCalls) {
      // Плейсхолдер до интеграции / первых звонков
      return [
        {
          id: "empty-1",
          badge: "🔑 Интеграция не активна",
          title: "Подключи AmoCRM или Bitrix24",
          subtitle: "Без интеграции CallX не видит звонки",
          description:
            "Зайди в раздел «Интеграции», включи AmoCRM или Bitrix24 и укажи домен + ключ. После этого звонки начнут падать сюда в режиме реального времени.",
          tone: "danger",
        },
        {
          id: "empty-2",
          badge: "🧩 Что будет дальше",
          title: "CallX сам подтянет историю звонков",
          subtitle: "За выбранный период",
          description:
            "Как только интеграция включена, CallX заберёт историю звонков за период и начнёт оценивать каждый диалог по скрипту, приветствию, потребности и закрытию.",
          tone: "ok",
        },
        {
          id: "empty-3",
          badge: "📊 Аналитика по менеджерам",
          title: "Здесь появятся лучшие и слабые",
          subtitle: "По количеству звонков и качеству речи",
          description:
            "На этом слайдере ты увидишь, кто тащит отдел вверх, а кто сливает клиентов. Всё — по факту звонков, а не по ощущениям.",
          tone: "ok",
        },
        {
          id: "empty-4",
          badge: "⚙️ Реальный тайм",
          title: "Новые звонки — сразу в CallX",
          subtitle: "Обновление ленты каждые несколько минут",
          description:
            "CallX регулярно подтягивает новые звонки из CRM. Как только интеграция активна — дашборд оживает, и ты смотришь на живую картину по отделу.",
          tone: "good",
        },
      ];
    }

    // Когда звонки уже есть — реальные инсайты
    const slides: InsightSlide[] = [];

    if (bestByVolume) {
      slides.push({
        id: "live-1",
        badge: "🏆 Лидер по объёму",
        title: bestByVolume.name || "Без имени",
        subtitle: `${bestByVolume.total} звонков за период`,
        description:
          "Этот менеджер делает больше всего контактов. Проверь качество разговоров и перенеси лучшие фразы в скрипты отдела.",
        tone: "good",
      });
    }

    if (bestByScore) {
      slides.push({
        id: "live-2",
        badge: "💬 Лучший по качеству речи",
        title: bestByScore.name || "Без имени",
        subtitle: `Средний score: ${bestByScore.avgScore}/100`,
        description:
          "Сильный уровень работы по скрипту и с возражениями. Используй записи этих звонков как обучающий материал для команды.",
        tone: "good",
      });
    }

    slides.push({
      id: "live-3",
      badge: "📈 Средний балл отдела",
      title: `${avgScore || 0}/100`,
      subtitle:
        avgScore < 60
          ? "Ниже 60 — пора жёстко подтянуть скрипты"
          : avgScore < 80
          ? "Средний уровень — есть над чем работать"
          : "Отдел держит сильный уровень",
      description:
        "Смотри, какие менеджеры тянут средний балл вниз. Проведи разбор их звонков и докрути скрипты и возражения.",
      tone: avgScore < 60 ? "danger" : avgScore < 80 ? "ok" : "good",
    });

    slides.push({
      id: "live-4",
      badge: "⏳ В очереди на анализ",
      title: `${pendingCalls} звонков ждут обработки`,
      subtitle:
        pendingCalls === 0
          ? "Все звонки уже разобраны"
          : "Скоро по ним появятся score и этапы разговора",
      description:
        "CallX дозагружает и анализирует оставшиеся звонки. Чем меньше очередь — тем ближе ты к прозрачному отделу без слепых зон.",
      tone: pendingCalls > 0 ? "ok" : "good",
    });

    if (failedCalls > 0) {
      slides.push({
        id: "live-5",
        badge: "⚠️ Не удалось разобрать",
        title: `${failedCalls} звонков со статусом FAILED`,
        subtitle: "Стоит проверить эти записи",
        description:
          "Причины: битые файлы, пустые записи или нестандартный формат аудио. Проверь исходники и перезапусти анализ проблемных звонков.",
        tone: "danger",
      });
    }

    if (newCalls > 0 || processingCalls > 0) {
      slides.push({
        id: "live-6",
        badge: "⏱ Живой поток",
        title: "Новые звонки продолжают поступать",
        subtitle: `NEW: ${newCalls} · PROCESSING: ${processingCalls}`,
        description:
          "CallX работает в фоне и разбирает свежие звонки. Возвращайся к дашборду в течение дня и следи за динамикой качества.",
        tone: "ok",
      });
    }

    slides.push(
      {
        id: "live-7",
        badge: "🎯 Где потеря лидов",
        title: "Отфильтруй звонки с низким score",
        subtitle: "Например, ниже 60/100",
        description:
          "Сначала разберись с самыми слабыми диалогами. Найди паттерны: кто не приветствует, кто не задаёт вопросы, кто не закрывает на следующий шаг.",
        tone: "danger",
      },
      {
        id: "live-8",
        badge: "👥 Обучение команды",
        title: "Собери плейлист «Лучшие звонки»",
        subtitle: "На основе звонков с высоким score",
        description:
          "Сделай подборку сильных звонков и прогоняй новичков по этим примерам. Так ты стандартизируешь уровень команды.",
        tone: "good",
      },
      {
        id: "live-9",
        badge: "🧪 A/B скриптов",
        title: "Тестируй разные подводки и офферы",
        subtitle: "И смотри, как меняется score",
        description:
          "Сравни конверсии и баллы между старыми и новыми формулировками. CallX покажет, какие фразы реально работают.",
        tone: "ok",
      },
      {
        id: "live-10",
        badge: "📤 Excel-отчёт",
        title: "Выгрузи все звонки в Excel",
        subtitle: "И докрути аналитику в своих отчётах",
        description:
          "Нажми «Скачать Excel отчёт» и своди данные с CRM, выручкой и зарплатами менеджеров. Видно будет, кто реально приносит деньги.",
        tone: "ok",
      }
    );

    return slides;
  }, [
    hasCalls,
    avgScore,
    pendingCalls,
    failedCalls,
    newCalls,
    processingCalls,
    bestByVolume,
    bestByScore,
  ]);

  const currentSlide =
    insightSlides.length > 0
      ? insightSlides[Math.min(currentInsight, insightSlides.length - 1)]
      : null;

  function handleNextInsight() {
    if (insightSlides.length === 0) return;
    setCurrentInsight((prev) => (prev + 1) % insightSlides.length);
  }

  function handlePrevInsight() {
    if (insightSlides.length === 0) return;
    setCurrentInsight((prev) =>
      prev === 0 ? insightSlides.length - 1 : prev - 1
    );
  }

  function handleDotClick(index: number) {
    setCurrentInsight(index);
  }

  return (
    <main className="min-h-screen w-full bg-black text-neutral-50">
      <div className="mx-auto flex w-full flex-col gap-8 px-4 sm:px-6 lg:px-10 xl:px-16 py-8 sm:py-10 lg:py-12">
        {/* HEADER */}
        <header className="flex flex-col gap-4 lg:gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-800/80 bg-neutral-950/90 px-3.5 py-1.5 text-[11px] text-neutral-400 shadow-[0_0_30px_rgba(34,197,94,0.15)]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Главный дашборд CallX</span>
              <span className="text-[10px] text-neutral-500">
                live-обновление каждые несколько минут
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl xl:text-[32px] font-semibold tracking-tight">
              Обзор отдела продаж{" "}
              <span className="text-neutral-500">
                (
                {PERIOD_OPTIONS.find((p) => p.value === period)?.label}
                )
              </span>
            </h1>
            <p className="text-sm text-neutral-400 max-w-2xl">
              Сколько звонков сделали, сколько CallX успел разобрать и какой
              средний балл по отделу. Всё в одном экране — без отчётов в Excel.
            </p>
          </div>

          <div className="flex flex-col items-end gap-3 text-xs text-neutral-400">
            <div className="flex flex-wrap gap-1.5 justify-end">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPeriod(opt.value)}
                  className={`rounded-full px-3.5 py-1.5 border transition text-[11px] ${
                    period === opt.value
                      ? "bg-gradient-to-r from-emerald-400 to-lime-300 text-black border-transparent shadow-[0_0_18px_rgba(74,222,128,0.7)]"
                      : "bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-600 hover:text-neutral-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleExportExcel}
              disabled={exportLoading}
              className="mt-1 inline-flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-950 px-3.5 py-1.5 text-[11px] text-neutral-200 hover:border-emerald-400 hover:text-white hover:bg-neutral-900 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {exportLoading ? "Готовим Excel…" : "Скачать Excel отчёт"}
            </button>
          </div>
        </header>

        {/* LOADING */}
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-neutral-800 bg-neutral-950/95 px-4 py-6 text-sm text-neutral-300 shadow-[0_18px_50px_rgba(0,0,0,0.85)]"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-neutral-900 border border-neutral-800 animate-pulse" />
              <div className="space-y-1">
                <p className="text-sm">Загружаем данные по звонкам…</p>
                <p className="text-[11px] text-neutral-500">
                  CallX подтягивает звонки из CRM и собирает краткий дашборд по
                  отделу.
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
              className="grid gap-4 md:grid-cols-3 xl:grid-cols-3"
            >
              {/* Всего звонков */}
              <div className="rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900/90 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.7)] hover:shadow-[0_22px_60px_rgba(0,0,0,0.9)] transition-shadow">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] uppercase text-neutral-500">
                    Всего звонков
                  </span>
                  <span className="text-[10px] rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-neutral-500">
                    {PERIOD_OPTIONS.find((p) => p.value === period)?.label}
                  </span>
                </div>
                <div className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">
                  {totalCalls}
                </div>
                <p className="mt-2 text-[12px] text-neutral-500">
                  Все звонки, которые попали в CallX за выбранный период.
                </p>
              </div>

              {/* Проанализировано */}
              <div className="rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900/90 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.7)] hover:shadow-[0_22px_60px_rgba(0,0,0,0.9)] transition-shadow">
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
                  Звонки со статусом{" "}
                  <span className="text-neutral-200">DONE</span>.
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
              <div className="rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900/90 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.7)] hover:shadow-[0_22px_60px_rgba(0,0,0,0.9)] transition-shadow">
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

            {/* ---------- БОЛЬШАЯ СТОРИС-КАРТОЧКА НА ПОЛ-ЭКРАНА ---------- */}
            {currentSlide && (
              <section className="mt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">
                    Инсайты CallX
                  </h2>
                  {!hasCalls && (
                    <div className="flex items-center gap-1 text-[11px] text-neutral-500">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-neutral-900 border border-neutral-800 text-[9px] opacity-70">
                        🔑
                      </span>
                      <span>Подключи интеграцию, чтобы увидеть живые данные</span>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <motion.div
                    key={currentSlide.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="w-full min-h-[45vh] max-h-[520px] rounded-3xl border border-neutral-800/80 bg-neutral-950/95 shadow-[0_40px_120px_rgba(0,0,0,0.95)] overflow-hidden relative flex flex-col justify-between p-6 sm:p-8"
                  >
                    {/* Градиентный фон по тону */}
                    <div
                      className={`pointer-events-none absolute inset-0 opacity-80 bg-gradient-to-br ${
                        currentSlide.tone === "danger"
                          ? "from-red-500/25 via-red-500/5 to-black"
                          : currentSlide.tone === "good"
                          ? "from-emerald-500/25 via-emerald-500/5 to-black"
                          : "from-sky-500/25 via-sky-500/5 to-black"
                      }`}
                    />
                    {/* Лёгкая сетка поверх */}
                    <div className="pointer-events-none absolute inset-0 opacity-[0.16] bg-[radial-gradient(circle_at_1px_1px,#ffffff33_1px,transparent_0)] [background-size:18px_18px]" />

                    {/* Верхняя часть: бейдж + заголовки */}
                    <div className="relative z-10 flex flex-col gap-3">
                      <div className="inline-flex items-center gap-2 text-[11px] text-neutral-300">
                        <span className="rounded-full border border-neutral-700/80 bg-black/70 px-2.5 py-0.5 backdrop-blur">
                          {currentSlide.badge}
                        </span>
                        {hasCalls ? (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            live data
                          </span>
                        ) : (
                          <span className="inline-flex h-5 px-2 items-center justify-center rounded-full bg-neutral-950/80 border border-neutral-700 text-[10px] opacity-80">
                            🔑 demo инсайты
                          </span>
                        )}
                      </div>

                      <h3 className="text-2xl sm:text-3xl font-semibold text-neutral-50 leading-tight">
                        {currentSlide.title}
                      </h3>
                      <p className="text-sm sm:text-[15px] text-neutral-200 max-w-xl">
                        {currentSlide.subtitle}
                      </p>
                    </div>

                    {/* Нижняя часть: описание / совет */}
                    <div className="relative z-10 mt-4 sm:mt-6">
                      <p className="text-[13px] sm:text-[14px] text-neutral-300 leading-relaxed max-w-2xl">
                        {currentSlide.description}
                      </p>
                    </div>

                    {/* Навигация по инсайтам */}
                    <div className="relative z-10 mt-6 flex items-center justify-between gap-4">
                      {/* Левая часть — прогресс / номер инсайта */}
                      <div className="flex flex-col gap-1 text-[11px] text-neutral-400">
                        <span>
                          Инсайт {currentInsight + 1} из {insightSlides.length}
                        </span>
                        <div className="h-1 w-28 rounded-full bg-neutral-900 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-400 to-lime-300"
                            style={{
                              width: `${
                                ((currentInsight + 1) / insightSlides.length) *
                                100
                              }%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Пагинация-точки + стрелки */}
                      <div className="flex items-center gap-4">
                        <div className="hidden sm:flex items-center gap-1.5">
                          {insightSlides.map((slide, idx) => (
                            <button
                              key={slide.id}
                              onClick={() => handleDotClick(idx)}
                              className={`h-1.5 rounded-full transition-all ${
                                idx === currentInsight
                                  ? "w-5 bg-emerald-400"
                                  : "w-2 bg-neutral-600 hover:bg-neutral-400"
                              }`}
                              aria-label={`Перейти к инсайту ${idx + 1}`}
                            />
                          ))}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={handlePrevInsight}
                            className="flex items-center justify-center rounded-full border border-neutral-700 bg-black/60 px-3 py-1.5 text-[11px] text-neutral-200 hover:border-neutral-400 hover:bg-neutral-900 transition"
                          >
                            ← Назад
                          </button>
                          <button
                            onClick={handleNextInsight}
                            className="flex items-center justify-center rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-3.5 py-1.5 text-[11px] font-semibold text-black shadow-[0_0_20px_rgba(74,222,128,0.6)] hover:shadow-[0_0_26px_rgba(190,242,100,0.8)] transition"
                          >
                            Дальше →
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </section>
            )}
            {/* ---------- КОНЕЦ БЛОКА СТОРИС-КАРТОЧКИ ---------- */}

            {/* Сводка по менеджерам */}
            {topManagers.length > 0 && (
              <section className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">
                    Менеджеры (топ-5 по количеству звонков)
                  </h2>
                  <span className="text-[11px] text-neutral-500">
                    Всего менеджеров:{" "}
                    <span className="text-neutral-200">
                      {managerStats.length}
                    </span>
                  </span>
                </div>

                <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-[0_18px_40px_rgba(0,0,0,0.75)]">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-neutral-950 text-[11px] uppercase text-neutral-500">
                      <tr>
                        <th className="px-4 py-3">Менеджер</th>
                        <th className="px-4 py-3">Звонков</th>
                        <th className="px-4 py-3">DONE</th>
                        <th className="px-4 py-3">Средний score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topManagers.map((m) => (
                        <tr
                          key={m.name}
                          className="border-t border-neutral-800/80 hover:bg-neutral-900/70 transition-colors"
                        >
                          <td className="px-4 py-2 text-sm text-neutral-200">
                            {m.name}
                          </td>
                          <td className="px-4 py-2 text-sm text-neutral-200">
                            {m.total}
                          </td>
                          <td className="px-4 py-2 text-sm text-neutral-200">
                            {m.done}
                          </td>
                          <td className="px-4 py-2 text-sm text-neutral-200">
                            {m.avgScore ? `${m.avgScore}/100` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Разделы */}
            <section className="mt-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">
                Разделы
              </h2>
              <div className="grid gap-4 md:grid-cols-3">
                <Link
                  href="/app/calls"
                  className="group rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-[0_16px_35px_rgba(0,0,0,0.75)] transition hover:border-emerald-400/70 hover:bg-neutral-900 hover:shadow-[0_22px_60px_rgba(0,0,0,0.9)]"
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
                  className="group rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-[0_16px_35px_rgba(0,0,0,0.75)] transition hover:border-emerald-400/70 hover:bg-neutral-900 hover:shadow-[0_22px_60px_rgba(0,0,0,0.9)]"
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
                  className="group rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-[0_16px_35px_rgba(0,0,0,0.75)] transition hover:border-emerald-400/70 hover:bg-neutral-900 hover:shadow-[0_22px_60px_rgba(0,0,0,0.9)]"
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

            {/* Последние звонки */}
            <section className="mt-6 space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">
                Последние звонки
              </h2>
              <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-[0_18px_50px_rgba(0,0,0,0.8)]">
                <div className="max-h-[340px] w-full overflow-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-neutral-950 text-[11px] uppercase text-neutral-500">
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
                            Пока нет звонков за выбранный период.
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
