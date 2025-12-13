// src/app/(app)/analytics/page.tsx

import Shell from "@/components/layout/Shell";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CallStatus } from "@prisma/client";

type TopManager = {
  id: string;
  name: string;
  calls: number;
  avgScore: number | null;
};

export default async function AnalyticsPage() {
  const session = await auth();
  const companyId = (session?.user as any)?.companyId as string | undefined;

  if (!companyId) {
    return (
      <Shell>
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-xl sm:text-2xl font-semibold">Нет доступа</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Авторизуйся под рабочим аккаунтом компании, чтобы видеть аналитику.
          </p>
        </div>
      </Shell>
    );
  }

  // Базовые метрики по звонкам
  const [totalCalls, doneCalls, errorCalls, inProgressCalls] =
    await Promise.all([
      db.call.count({ where: { companyId } }),
      db.call.count({
        where: { companyId, status: CallStatus.DONE },
      }),
      db.call.count({
        where: { companyId, status: CallStatus.ERROR },
      }),
      db.call.count({
        where: { companyId, status: CallStatus.PROCESSING },
      }),
    ]);

  // Средний скоринг по завершённым
  const avgScoreAgg = await db.call.aggregate({
    where: {
      companyId,
      status: CallStatus.DONE,
      score: { not: null },
    },
    _avg: { score: true },
  });

  const avgScore =
    avgScoreAgg._avg?.score != null
      ? Math.round(avgScoreAgg._avg.score!)
      : null;

  // Доп. метрики по score — как в PPTX
  const [scoredCallsCount, lowScoreCount, highScoreCount] =
    await Promise.all([
      db.call.count({
        where: {
          companyId,
          status: CallStatus.DONE,
          score: { not: null },
        },
      }),
      db.call.count({
        where: {
          companyId,
          status: CallStatus.DONE,
          score: { lt: 60 },
        },
      }),
      db.call.count({
        where: {
          companyId,
          status: CallStatus.DONE,
          score: { gte: 80 },
        },
      }),
    ]);

  // Топ менеджеров по количеству звонков
  const managersAggRaw = await (db.call as any).groupBy({
    by: ["managerId"],
    where: { companyId, managerId: { not: null } },
    _count: { _all: true },
    _avg: { score: true },
    orderBy: { _count: { _all: "desc" } },
    take: 5,
  });

  const managersAgg = managersAggRaw as {
    managerId: string | null;
    _count: { _all: number };
    _avg: { score: number | null };
  }[];

  const managerIds: string[] = managersAgg
    .map((m) => m.managerId)
    .filter((id): id is string => !!id);

  const managers = managerIds.length
    ? await db.manager.findMany({
        where: { id: { in: managerIds } },
      })
    : [];

  const topManagers: TopManager[] = managersAgg.map((m) => {
    const manager = managers.find((mm) => mm.id === m.managerId);
    const calls = m._count?._all ?? 0;
    const avg =
      m._avg?.score != null ? Math.round(m._avg.score!) : null;

    return {
      id: m.managerId ?? "unknown",
      name: manager?.name || "Без менеджера",
      calls,
      avgScore: avg,
    };
  });

  // Доп. агрегаты по менеджерам для онлайновой "презентации"
  const strongManagers = topManagers.filter(
    (m) => (m.avgScore ?? 0) >= 80
  );
  const weakManagers = topManagers.filter(
    (m) => (m.avgScore ?? 0) > 0 && (m.avgScore ?? 0) < 60
  );
  const managersLine = topManagers.length
    ? topManagers.map((m) => m.name).join(", ")
    : "Пока нет менеджеров с привязкой к звонкам";

  const avgScoreLabel =
    avgScore === null
      ? "Скоринг пока не посчитан"
      : avgScore < 60
      ? "ниже 60 — тревожный уровень"
      : avgScore < 80
      ? "60–80 — средний уровень, есть точки роста"
      : "80+ — сильный уровень работы отдела";

  const errorRate =
    totalCalls > 0 ? Math.round((errorCalls * 100) / totalCalls) : 0;

  return (
    <Shell>
      <main className="px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        {/* Хедер */}
        <div className="mb-5 sm:mb-7">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight">
            Аналитика по звонкам
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-neutral-500 max-w-xl">
            Короткая сводка по работе CallX: сколько звонков уже разобрано, где
            ошибки и какой средний score по отделу.
          </p>
        </div>

        {/* Метрики — адаптивная сетка для мобилки */}
        <section className="mb-6 sm:mb-8">
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
            <Card label="Всего звонков" value={totalCalls} />
            <Card label="Успешные (DONE)" value={doneCalls} tone="good" />
            <Card label="Ошибки (ERROR)" value={errorCalls} tone="danger" />
            <Card label="В работе" value={inProgressCalls} tone="warn" />
            <Card
              label="Средний скоринг"
              value={avgScore !== null ? `${avgScore}/100` : "—"}
            />
          </div>
        </section>

        {/* Таблица по менеджерам — с горизонтальным скроллом на мобилке */}
        {topManagers.length > 0 && (
          <section className="mt-2 space-y-4">
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-neutral-200 mb-2">
                Топ менеджеров по количеству звонков
              </h2>

              {/* обёртка для скролла на маленьких экранах */}
              <div className="-mx-4 sm:mx-0 overflow-x-auto">
                <div className="min-w-[420px] sm:min-w-0 border border-neutral-900 rounded-2xl overflow-hidden text-xs sm:text-sm bg-black/40">
                  <div className="grid grid-cols-3 px-3 sm:px-4 py-2.5 bg-neutral-950 text-neutral-500">
                    <div>Менеджер</div>
                    <div className="text-right sm:text-left">Звонков</div>
                    <div className="text-right">Средний скоринг</div>
                  </div>
                  {topManagers.map((m) => (
                    <div
                      key={m.id}
                      className="grid grid-cols-3 px-3 sm:px-4 py-2.5 border-t border-neutral-900 text-neutral-300"
                    >
                      <div className="truncate">{m.name}</div>
                      <div className="text-right sm:text-left">
                        {m.calls}
                      </div>
                      <div className="text-right">
                        {m.avgScore != null ? `${m.avgScore}/100` : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Краткое резюме по менеджерам */}
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-xs sm:text-sm text-neutral-300">
              <p>
                Всего менеджеров в выборке:{" "}
                <span className="text-neutral-50 font-medium">
                  {topManagers.length}
                </span>
                . Лидеры по качеству (80+/100):{" "}
                <span className="text-emerald-300 font-medium">
                  {strongManagers.length || "0"}
                </span>
                , нуждаются в прокачке (&lt; 60/100):{" "}
                <span className="text-red-300 font-medium">
                  {weakManagers.length || "0"}
                </span>
                .
              </p>
              <p className="mt-1 text-[11px] sm:text-xs text-neutral-500">
                Список менеджеров: {managersLine}.
              </p>
            </div>
          </section>
        )}

        {/* Экспорт презентации */}
        <section className="mt-6 sm:mt-8">
          <h2 className="text-sm sm:text-base font-semibold text-neutral-200 mb-2">
            Экспорт отчёта
          </h2>
          <p className="text-xs sm:text-sm text-neutral-500 mb-3 max-w-xl">
            Сгенерируй готовую презентацию в PowerPoint: CallX соберёт за тебя
            сводку по отделу, менеджерам и проблемным зонам. Подходит для
            отчёта руководству или команды.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api/analytics/presentation?period=30d"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-4 py-2 text-xs sm:text-sm font-semibold text-black shadow-[0_0_22px_rgba(74,222,128,0.65)] hover:brightness-105 transition"
            >
              Скачать презентацию PPTX (30 дней)
            </a>
            <a
              href="/api/analytics/presentation?period=90d"
              className="inline-flex items-center justify-center rounded-full border border-neutral-700 bg-neutral-950 px-4 py-2 text-[11px] sm:text-xs text-neutral-200 hover:border-emerald-400 hover:text-white hover:bg-neutral-900 transition"
            >
              Версия за 90 дней
            </a>
            <span className="text-[10px] sm:text-[11px] text-neutral-500">
              Файл можно сразу показать на планёрке или доправить под свой
              бренд.
            </span>
          </div>
        </section>

        {/* Превью презентации прямо в интерфейсе */}
        <section className="mt-7 sm:mt-9">
          <h2 className="text-sm sm:text-base font-semibold text-neutral-200 mb-2">
            Превью презентации (онлайн)
          </h2>
          <p className="text-xs sm:text-sm text-neutral-500 mb-4 max-w-2xl">
            Ниже — условные «слайды», которые лягут в презентацию: руководителю
            не нужно открывать файл, чтобы понять картину по отделу.
          </p>

          <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {/* Слайд 1 — Общая картина по отделу */}
            <SlideCard
              index={1}
              title="Общая сводка по звонкам"
              subtitle="Сколько команда реально отработала"
              body={`За выбранный период отдел обработал ${totalCalls} звонков. Из них полностью проанализировано (DONE): ${doneCalls}, в работе (PROCESSING): ${inProgressCalls}, ошибок анализа (ERROR): ${errorCalls}.`}
            />

            {/* Слайд 2 — Качество разговоров (score) */}
            <SlideCard
              index={2}
              title="Качество разговоров (AI-score)"
              subtitle="Средний уровень работы по скрипту"
              body={`Звонков с присвоенным score: ${scoredCallsCount}. Средний score по отделу: ${
                avgScore !== null ? `${avgScore}/100` : "нет данных"
              }. Низкий score (< 60): ${lowScoreCount}, высокий score (≥ 80): ${highScoreCount}. ${avgScoreLabel}.`}
            />

            {/* Слайд 3 — Статусы и очередь */}
            <SlideCard
              index={3}
              title="Статусы обработки звонков"
              subtitle="Где залипают звонки по статусам"
              body={`DONE: ${doneCalls} — звонки полностью проанализированы. NEW и PROCESSING формируют очередь, сейчас в PROCESSING: ${inProgressCalls}. Ошибок (ERROR): ${errorCalls} (${errorRate}% от всех звонков). Важно следить, чтобы очередь оставалась в объёме, который команда успевает разбирать в течение дня.`}
            />

            {/* Слайд 4 — Топ менеджеров по объёму */}
            <SlideCard
              index={4}
              title="Топ менеджеров по количеству звонков"
              subtitle="Кто делает больше всего контактов"
              body={
                topManagers.length
                  ? `Лидеры по количеству звонков: ${topManagers
                      .slice(0, 3)
                      .map(
                        (m) =>
                          `${m.name} — ${m.calls} звонков${
                            m.avgScore ? `, avg score ~${m.avgScore}/100` : ""
                          }`
                      )
                      .join("; ")}. Эти сотрудники создают основную «массу» контактов отдела.`
                  : "Пока нет менеджеров с привязкой к звонкам — нужно убедиться, что у звонков указан ответственный менеджер."
              }
            />

            {/* Слайд 5 — Проблемные зоны (низкий score / ERROR) */}
            <SlideCard
              index={5}
              title="Проблемные зоны"
              subtitle="Где теряются звонки и клиенты"
              body={`Звонков с низким score (< 60): ${lowScoreCount}. Звонков с ошибкой анализа (ERROR): ${errorCalls}. Эти звонки стоит разобрать в приоритете: сначала — технические проблемы записей (битые файлы, пустой звук), затем — повторяющиеся ошибки по скрипту: приветствие, выявление потребности, работа с возражениями, закрытие.`}
            />

            {/* Слайд 6 — Менеджеры, требующие внимания */}
            <SlideCard
              index={6}
              title="Менеджеры, требующие внимания"
              subtitle="Зона риска по качеству речи"
              body={
                weakManagers.length > 0
                  ? `Менеджеров с низким средним score (&lt; 60/100) среди топа: ${weakManagers.length}. Рекомендуется: выделить их звонки, провести разбор по этапам разговора и дать персональные рекомендации по скрипту.`
                  : "Среди топ-менеджеров нет ярко выраженных «провалов» по качеству — можно фокусироваться на общем повышении уровня скрипта и донастройке формулировок."
              }
            />

            {/* Слайд 7 — Лидеры и best-practice */}
            <SlideCard
              index={7}
              title="Лидеры и best-practice"
              subtitle="На чьих звонках строить обучение"
              body={
                strongManagers.length > 0
                  ? `Менеджеров с высоким средним score (80+/100): ${strongManagers.length}. Сделай плейлист лучших звонков этих сотрудников и используй его как эталон для обучения всей команды.`
                  : "Пока нет устойчивых лидеров с score 80+/100. Задача на следующий период — выделить сильные паттерны разговоров и закрепить их в скриптах и обучении."
              }
            />

            {/* Слайд 8 — План действий */}
            <SlideCard
              index={8}
              title="План действий по отделу"
              subtitle="Что сделать, чтобы вырасти на следующий месяц"
              body="1) Отобрать слабые звонки (score < 60) и разобрать их пошагово. 2) Выделить лучшие звонки (score ≥ 80) и оформить из них эталонный плейлист. 3) Обновить скрипты под реальные возражения клиентов. 4) Ввести регулярный разбор звонков: 1–2 сессии в неделю по 30–60 минут. 5) Еженедельно смотреть дашборд CallX и отслеживать динамику score и распределение по менеджерам."
            />

            {/* Слайд 9 — Фокус-метрики */}
            <SlideCard
              index={9}
              title="Фокус-метрики на следующий период"
              subtitle="На какие числа смотреть первым делом"
              body="Рекомендуется зафиксировать целевые значения: минимальная доля проанализированных звонков (DONE), целевой средний score по отделу и минимально допустимый score для каждого менеджера. Эти цели должны стать «дашбордом внимания» руководителя."
            />

            {/* Слайд 10 — Итоговый вывод */}
            <SlideCard
              index={10}
              title="Итоговый вывод для руководства"
              subtitle="Состояние отдела продаж по звонкам"
              body={`CallX даёт прозрачную фактуру по каждому звонку, менеджеру и качеству скрипта. Уже сейчас видно, как команда работает с входящим трафиком и где прячутся потери. Следующий шаг — закрепить сильные практики, выровнять слабые зоны по людям и этапам диалога и регулярно возвращаться к аналитике как к рабочему инструменту, а не просто отчёту.`}
            />
          </div>
        </section>
      </main>
    </Shell>
  );
}

function Card({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "good" | "warn" | "danger";
}) {
  const toneBorder =
    tone === "good"
      ? "border-emerald-500/40"
      : tone === "warn"
      ? "border-amber-400/40"
      : tone === "danger"
      ? "border-red-500/40"
      : "border-neutral-900";

  const toneBg =
    tone === "good"
      ? "bg-emerald-500/5"
      : tone === "warn"
      ? "bg-amber-500/5"
      : tone === "danger"
      ? "bg-red-500/5"
      : "bg-neutral-950/60";

  return (
    <div
      className={`rounded-2xl p-3.5 sm:p-4 border ${toneBorder} ${toneBg} shadow-[0_14px_40px_rgba(0,0,0,0.7)]`}
    >
      <div className="text-[11px] sm:text-xs text-neutral-500 mb-1">
        {label}
      </div>
      <div className="text-lg sm:text-xl font-semibold text-neutral-50">
        {value}
      </div>
    </div>
  );
}

function SlideCard(props: {
  index: number;
  title: string;
  subtitle: string;
  body: string;
}) {
  return (
    <div className="relative rounded-2xl border border-neutral-800 bg-neutral-950/80 px-4 py-4 sm:px-5 sm:py-5 shadow-[0_18px_45px_rgba(0,0,0,0.8)]">
      <div className="absolute left-3 top-3 h-6 w-6 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center text-[11px] text-neutral-400">
        {props.index}
      </div>
      <div className="pl-8">
        <h3 className="text-sm sm:text-base font-semibold text-neutral-50">
          {props.title}
        </h3>
        <p className="mt-1 text-[11px] sm:text-xs text-neutral-400">
          {props.subtitle}
        </p>
      </div>
      <p className="mt-3 text-xs sm:text-sm text-neutral-300 leading-relaxed">
        {props.body}
      </p>
    </div>
  );
}
