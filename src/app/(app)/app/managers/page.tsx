// src/app/(app)/app/managers/page.tsx

import Shell from "@/components/layout/Shell";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

type ManagerStat = {
  key: string;
  id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  totalCalls: number;
  doneCalls: number;
  scoredCalls: number;
  lowScoreCalls: number;
  avgScore: number;
  lastCallAt: Date | null;
};

export default async function ManagersPage() {
  const session = await auth();
  const companyId = (session?.user as any)?.companyId as string | undefined;

  if (!companyId) {
    return (
      <Shell>
        <div className="mx-auto max-w-4xl py-10 px-4 sm:px-6 lg:px-0">
          <div className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-6 text-sm text-red-100 shadow-[0_18px_50px_rgba(0,0,0,0.85)]">
            <h1 className="mb-1 text-lg font-semibold">Нет доступа</h1>
            <p className="text-[13px] text-red-100/80">
              Похоже, у текущего аккаунта нет привязки к компании. Обратись к
              администратору или создай рабочее пространство.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  // Берём все звонки компании и подтягиваем данные менеджера
  const calls = await db.call.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      status: true,
      score: true,
      managerId: true,
      manager: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          createdAt: true,
        },
      },
    },
  });

  // Агрегация по менеджерам
  const statsMap = new Map<string, ManagerStat>();

  for (const c of calls) {
    const m = c.manager;

    const id = m?.id ?? null;
    const name = m?.name?.trim() || "Без менеджера";
    const email = m?.email ?? null;
    const phone = m?.phone ?? null;

    // ключ: либо id, либо имя
    const key = id ?? `name:${name}`;

    if (!statsMap.has(key)) {
      statsMap.set(key, {
        key,
        id,
        name,
        email,
        phone,
        totalCalls: 0,
        doneCalls: 0,
        scoredCalls: 0,
        lowScoreCalls: 0,
        avgScore: 0,
        lastCallAt: null,
      });
    }

    const stat = statsMap.get(key)!;

    stat.totalCalls += 1;
    if (c.status === "DONE") stat.doneCalls += 1;

    if (typeof c.score === "number") {
      stat.scoredCalls += 1;
      stat.avgScore =
        stat.avgScore === 0 ? c.score : stat.avgScore + c.score; // копим сумму, потом поделим
      if (c.score < 60) stat.lowScoreCalls += 1;
    }

    if (!stat.lastCallAt || c.createdAt > stat.lastCallAt) {
      stat.lastCallAt = c.createdAt;
    }
  }

  // Финальный пересчёт среднего score
  const managerStats: ManagerStat[] = Array.from(statsMap.values()).map(
    (s) => ({
      ...s,
      avgScore:
        s.scoredCalls > 0 ? Math.round(s.avgScore / s.scoredCalls) : 0,
    })
  );

  // Сортировка: по звонкам
  managerStats.sort((a, b) => b.totalCalls - a.totalCalls);

  const totalManagers = managerStats.length;
  const totalCallsAll = managerStats.reduce(
    (sum, m) => sum + m.totalCalls,
    0
  );
  const totalScoredCallsAll = managerStats.reduce(
    (sum, m) => sum + m.scoredCalls,
    0
  );
  const totalLowScoreAll = managerStats.reduce(
    (sum, m) => sum + m.lowScoreCalls,
    0
  );

  // Средний score по всей команде (по звонкам)
  const avgScoreTeam =
    totalScoredCallsAll > 0
      ? Math.round(
          managerStats.reduce(
            (acc, m) => acc + m.avgScore * m.scoredCalls,
            0
          ) / totalScoredCallsAll
        )
      : 0;

  // Сколько менеджеров в зоне риска (средний score < 60)
  const riskManagers = managerStats.filter((m) => m.avgScore > 0 && m.avgScore < 60);
  const strongManagers = managerStats.filter((m) => m.avgScore >= 80);

  // Лучший / худший по score (минимум N оценённых звонков, чтобы не по 1 звонку)
  const MIN_SCORED_FOR_RANK = 5;
  const rankedManagers = managerStats.filter(
    (m) => m.scoredCalls >= MIN_SCORED_FOR_RANK
  );

  const bestByScore =
    rankedManagers.length > 0
      ? [...rankedManagers].sort((a, b) => b.avgScore - a.avgScore)[0]
      : null;

  const worstByScore =
    rankedManagers.length > 0
      ? [...rankedManagers].sort((a, b) => a.avgScore - b.avgScore)[0]
      : null;

  return (
    <Shell>
      <div className="mx-auto w-full max-w-none px-4 pb-24 pt-6 sm:px-6 sm:pt-8 lg:px-10 xl:px-16 lg:pb-12">
        {/* HEADER */}
        <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2.5">
            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950/90 px-3.5 py-1.5 text-[10px] sm:text-[11px] text-neutral-400 shadow-[0_0_26px_rgba(34,197,94,0.25)]">
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-400 animate-pulse" />
              <span className="truncate">
                Менеджеры по данным реальных звонков
              </span>
              <span className="hidden sm:inline text-[10px] text-neutral-500">
                CallX берёт людей из CRM и строит по ним аналитику
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-50 sm:text-3xl lg:text-4xl">
              Менеджеры и их реальная эффективность
            </h1>
            <p className="max-w-2xl text-[12px] text-neutral-400 sm:text-sm">
              Здесь видно, кто делает много звонков, кто держит высокий score,
              а кто сливает лидов. Никаких ручных отчётов — всё подтягивается из
              звонков и CRM.
            </p>
          </div>

          <div className="flex flex-col items-start gap-1.5 text-[11px] text-neutral-500 md:items-end">
            <div>
              Менеджеров в звонках:{" "}
              <span className="font-medium text-neutral-200">
                {totalManagers}
              </span>
            </div>
            <div>
              Всего звонков:{" "}
              <span className="font-medium text-neutral-200">
                {totalCallsAll}
              </span>
            </div>
            {totalScoredCallsAll > 0 && (
              <div>
                Звонков со score:{" "}
                <span className="font-medium text-neutral-200">
                  {totalScoredCallsAll}
                </span>
              </div>
            )}
            <span className="text-[11px] text-emerald-300/80">
              Просто подключи CRM — CallX сам соберёт и обновит эту картину.
            </span>
          </div>
        </header>

        {/* TOP STATS: дэшборд по команде */}
        <section className="mb-7">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Менеджеров */}
            <div className="rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900/90 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.7)]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase text-neutral-500">
                  Менеджеров в звонках
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                {totalManagers}
              </div>
              <p className="mt-2 text-[12px] text-neutral-500">
                Все люди, которые хоть раз фигурировали как менеджер в звонках
                из CRM.
              </p>
            </div>

            {/* Средний score по команде */}
            <div className="rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900/90 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.7)]">
              <span className="text-[11px] uppercase text-neutral-500">
                Средний score по команде
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-semibold sm:text-3xl">
                  {avgScoreTeam || 0}/100
                </span>
                {totalScoredCallsAll > 0 && (
                  <span className="text-xs text-neutral-400">
                    по {totalScoredCallsAll} оценённым звонкам
                  </span>
                )}
              </div>
              <p className="mt-2 text-[12px] text-neutral-500">
                Ниже 60 — зона риска по скриптам и работе с возражениями, выше
                80 — сильная команда.
              </p>
            </div>

            {/* Риски / сильные */}
            <div className="rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900/90 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.7)]">
              <span className="text-[11px] uppercase text-neutral-500">
                Риски и сильные
              </span>
              <div className="mt-2 space-y-1.5 text-[12px] text-neutral-300">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-neutral-400">
                    В зоне риска (score &lt; 60)
                  </span>
                  <span className="font-medium text-red-300">
                    {riskManagers.length}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-neutral-400">
                    Сильные (score ≥ 80)
                  </span>
                  <span className="font-medium text-emerald-300">
                    {strongManagers.length}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-neutral-400">
                    Слабых звонков (&lt;60)
                  </span>
                  <span className="font-medium text-amber-300">
                    {totalLowScoreAll}
                  </span>
                </div>
              </div>
              {totalLowScoreAll > 0 && (
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-900">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400"
                    style={{
                      width:
                        totalScoredCallsAll > 0
                          ? `${Math.min(
                              100,
                              Math.round(
                                (totalLowScoreAll * 100) / totalScoredCallsAll
                              )
                            )}%`
                          : "0%",
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* СТРИП-СТОРИС ПО МЕНЕДЖЕРАМ */}
        <section className="mb-7">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Команда отдела продаж
            </h2>
            {totalManagers > 0 && (
              <span className="text-[11px] text-neutral-500">
                Только те, у кого уже были звонки
              </span>
            )}
          </div>

          <div className="relative rounded-3xl border border-neutral-900 bg-neutral-950/80 px-3 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.75)]">
            {/* фон-сетка */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#ffffff22_1px,transparent_0)] opacity-[0.16] [background-size:18px_18px]" />

            {totalManagers === 0 ? (
              <div className="relative z-10 flex items-center justify-between gap-3 px-1 py-2">
                <div className="space-y-1">
                  <p className="text-sm text-neutral-200">
                    Пока нет ни одного менеджера в звонках.
                  </p>
                  <p className="max-w-md text-[11px] text-neutral-500">
                    Подключи AmoCRM / Bitrix24 и налей трафик — CallX сам
                    подтянет людей из записей и построит по ним аналитику.
                  </p>
                </div>
              </div>
            ) : (
              <div className="relative z-10 flex items-center gap-3 overflow-x-auto py-1.5 px-0.5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-700/70">
                {managerStats.slice(0, 16).map((m) => (
                  <div
                    key={m.key}
                    className="flex min-w-[110px] max-w-[130px] flex-col items-center justify-start gap-1.5"
                  >
                    <div className="relative">
                      <div className="h-14 w-14 rounded-full bg-gradient-to-tr from-emerald-400 via-lime-300 to-emerald-500 p-[2px] shadow-[0_0_18px_rgba(74,222,128,0.7)]">
                        <div className="flex h-full w-full items-center justify-center rounded-full bg-neutral-950 text-[13px] font-semibold text-neutral-100">
                          {m.name?.[0]?.toUpperCase() || "M"}
                        </div>
                      </div>
                      {m.avgScore > 0 && (
                        <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-950 text-[10px] font-semibold text-neutral-100 border border-neutral-700">
                          {m.avgScore}
                        </div>
                      )}
                    </div>
                    <div className="w-full space-y-0.5 text-center">
                      <div className="truncate text-[11px] text-neutral-200">
                        {m.name}
                      </div>
                      <div className="text-[10px] text-neutral-500">
                        Звонков: {m.totalCalls}
                        {m.doneCalls ? ` · DONE: ${m.doneCalls}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
                {totalManagers > 16 && (
                  <div className="flex min-w-[80px] flex-col items-center justify-center gap-1.5">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-neutral-700 text-[12px] text-neutral-400">
                      +{totalManagers - 16}
                    </div>
                    <div className="text-center text-[10px] text-neutral-500">
                      ещё менеджеры
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

    {/* БЛОК: ЛУЧШИЙ / ХУДШИЙ МЕНЕДЖЕР */}
{(bestByScore || worstByScore) && (
  <section className="mb-7 grid gap-4 lg:grid-cols-2">
    {bestByScore && (
      <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4">
        <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-300">
          <span>Лидер по качеству речи</span>
          <span className="h-1 w-1 rounded-full bg-emerald-300" />
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-neutral-50">
              {bestByScore.name}
            </h3>
            <p className="mt-1 text-[12px] text-neutral-300">
              Средний score:{" "}
              <span className="font-semibold text-emerald-300">
                {bestByScore.avgScore}/100
              </span>{" "}
              по {bestByScore.scoredCalls} звонкам.
            </p>
          </div>
          <div className="text-right text-[11px] text-neutral-400">
            Звонков: {bestByScore.totalCalls}
            <br />
            DONE: {bestByScore.doneCalls}
          </div>
        </div>
        <p className="mt-3 text-[12px] text-neutral-300">
          Используй звонки этого менеджера как эталон: выпиши лучшие фразы и
          сделай по ним обучающий плейлист для отдела.
        </p>
      </div>
    )}

    {worstByScore && (
      <div className="rounded-2xl border border-red-500/40 bg-red-500/5 p-4">
        <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-red-300">
          <span>Зона риска по качеству</span>
          <span className="h-1 w-1 rounded-full bg-red-300" />
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-neutral-50">
              {worstByScore.name}
            </h3>
            <p className="mt-1 text-[12px] text-neutral-300">
              Средний score:{" "}
              <span className="font-semibold text-red-300">
                {worstByScore.avgScore}/100
              </span>{" "}
              по {worstByScore.scoredCalls} звонкам.
            </p>
          </div>
          <div className="text-right text-[11px] text-neutral-400">
            Звонков: {worstByScore.totalCalls}
            <br />
            DONE: {worstByScore.doneCalls}
          </div>
        </div>
        <p className="mt-3 text-[12px] text-neutral-300">
          Здесь чаще всего теряются лиды. Пройди по слабым звонкам, найди
          паттерны, обнови скрипт и проведи точечное обучение.
        </p>
      </div>
    )}
  </section>
)}

        {/* СПИСОК МЕНЕДЖЕРОВ + СТАТИСТИКА */}
        <section className="space-y-3">
          <div className="flex flex-col items-start justify-between gap-1.5 sm:flex-row sm:items-center">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500 sm:text-sm">
              Менеджеры из звонков
            </h2>
            {totalManagers > 0 && (
              <span className="text-[11px] text-neutral-500">
                По каждому: звонки, DONE, средний score и доля слабых звонков
              </span>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/85 shadow-[0_18px_50px_rgba(0,0,0,0.8)]">
            {/* HEADER ROW (desktop) */}
            <div className="hidden grid-cols-4 px-4 py-2.5 text-[11px] uppercase tracking-wide text-neutral-500 sm:grid bg-neutral-950/95">
              <div>Менеджер</div>
              <div>Контакты</div>
              <div className="text-center">Звонки / DONE</div>
              <div className="text-right">Score / слабые</div>
            </div>

            {totalManagers === 0 && (
              <div className="px-4 py-6 text-center text-[12px] text-neutral-500">
                Пока нет ни одного менеджера в звонках. Как только появятся
                записи из CRM, здесь появится рейтинг по людям.
              </div>
            )}

            {/* DESKTOP ROWS */}
            <div className="hidden sm:block">
              {managerStats.map((m) => {
                const doneRate =
                  m.totalCalls > 0
                    ? Math.round((m.doneCalls * 100) / m.totalCalls)
                    : 0;

                const lowShare =
                  m.scoredCalls > 0
                    ? Math.round(
                        (m.lowScoreCalls * 100) / m.scoredCalls
                      )
                    : 0;

                return (
                  <div
                    key={m.key}
                    className="grid grid-cols-4 items-center border-t border-neutral-900 px-4 py-2.5 text-sm text-neutral-200 hover:bg-neutral-900/70 transition-colors"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="truncate text-sm">{m.name}</span>
                      {m.lastCallAt && (
                        <span className="text-[10px] text-neutral-500">
                          Последний звонок:{" "}
                          {m.lastCallAt.toLocaleDateString("ru-RU")}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col text-[11px] text-neutral-400">
                      {m.email ? (
                        <span className="truncate">{m.email}</span>
                      ) : (
                        <span className="text-neutral-600">
                          Email: —
                        </span>
                      )}
                      {m.phone ? (
                        <span className="truncate">{m.phone}</span>
                      ) : (
                        <span className="text-neutral-600">
                          Телефон: —
                        </span>
                      )}
                    </div>

                    <div className="text-center text-[11px] text-neutral-300">
                      {m.totalCalls} звонков
                      <br />
                      DONE: {m.doneCalls}
                      {m.totalCalls > 0 ? ` (${doneRate}%)` : ""}
                    </div>

                    <div className="text-right text-[11px] text-neutral-300">
                      Score: {m.avgScore || "—"}
                      <br />
                      Слабые (&lt;60): {m.lowScoreCalls}
                      {lowShare ? ` (${lowShare}%)` : ""}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* MOBILE CARDS */}
            <div className="divide-y divide-neutral-900 sm:hidden">
              {managerStats.map((m) => {
                const doneRate =
                  m.totalCalls > 0
                    ? Math.round((m.doneCalls * 100) / m.totalCalls)
                    : 0;

                const lowShare =
                  m.scoredCalls > 0
                    ? Math.round(
                        (m.lowScoreCalls * 100) / m.scoredCalls
                      )
                    : 0;

                return (
                  <div
                    key={m.key}
                    className="flex flex-col gap-2 px-4 py-3 text-[12px] text-neutral-200"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-[12px] font-semibold">
                          {m.name?.[0]?.toUpperCase() || "M"}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[13px] font-medium">
                            {m.name}
                          </span>
                          {m.lastCallAt && (
                            <span className="text-[10px] text-neutral-500">
                              Последний звонок:{" "}
                              {m.lastCallAt.toLocaleDateString("ru-RU")}
                            </span>
                          )}
                        </div>
                      </div>
                      {m.avgScore > 0 && (
                        <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-100 border border-neutral-700">
                          Score: {m.avgScore}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 text-[11px] text-neutral-300">
                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-900 px-2 py-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Звонков: {m.totalCalls}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-900 px-2 py-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                        DONE: {m.doneCalls}
                        {m.totalCalls > 0 ? ` (${doneRate}%)` : ""}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-900 px-2 py-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        Слабые (&lt;60): {m.lowScoreCalls}
                        {lowShare ? ` (${lowShare}%)` : ""}
                      </span>
                    </div>

                    {(m.email || m.phone) && (
                      <div className="mt-1 flex flex-col gap-0.5 text-[11px] text-neutral-400">
                        {m.email && <span className="truncate">{m.email}</span>}
                        {m.phone && <span className="truncate">{m.phone}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </Shell>
  );
}
