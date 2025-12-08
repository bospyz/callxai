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
            <h1 className="text-lg font-semibold mb-1">Нет доступа</h1>
            <p className="text-[13px] text-red-100/80">
              Похоже, у текущего аккаунта нет привязки к компании. Обратись к
              администратору или создай рабочее пространство.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  // Берём все звонки компании и подтягиваем данные менеджера из связи
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

  // Агрегация по менеджерам ИЗ звонков
  const statsMap = new Map<string, ManagerStat>();

  for (const c of calls) {
    const m = c.manager;

    const id = m?.id ?? null;
    const name = m?.name?.trim() || "Без менеджера";
    const email = m?.email ?? null;
    const phone = m?.phone ?? null;

    // ключ: либо id, либо имя, чтобы не слиплось
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
        stat.avgScore === 0
          ? c.score
          : stat.avgScore + c.score; // временно суммируем, потом поделим
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

  // Сортировка: сначала по количеству звонков
  managerStats.sort((a, b) => b.totalCalls - a.totalCalls);

  const totalManagers = managerStats.length;

  return (
    <Shell>
      <div className="mx-auto w-full max-w-none py-8 sm:py-10 lg:py-12 px-4 sm:px-6 lg:px-10 xl:px-16">
        {/* HEADER */}
        <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2.5">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950/90 px-3.5 py-1.5 text-[11px] text-neutral-400 shadow-[0_0_26px_rgba(34,197,94,0.25)]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Менеджеры по данным звонков</span>
              <span className="hidden sm:inline text-[10px] text-neutral-500">
                CallX подтягивает их из CRM автоматически
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-neutral-50">
              Менеджеры
            </h1>
            <p className="text-sm text-neutral-400 max-w-2xl">
              Мы не заставляем тебя руками заводить людей. CallX сам берёт
              менеджеров из звонков, считает по ним звонки, score и качество
              работы.
            </p>
          </div>

          <div className="text-xs text-neutral-500 flex flex-col items-start md:items-end gap-1.5">
            <div>
              Всего менеджеров в звонках:{" "}
              <span className="text-neutral-200 font-medium">
                {totalManagers}
              </span>
            </div>
            <span className="text-[11px] text-emerald-300/80">
              Просто подключи CRM — дальше CallX сам соберёт статистику.
            </span>
          </div>
        </header>

        {/* СТОРИС-СТРИП ПО МЕНЕДЖЕРАМ */}
        <section className="mb-7">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Команда отдела продаж
            </h2>
            {totalManagers > 0 && (
              <span className="text-[11px] text-neutral-500">
                Данные только по тем, у кого уже были звонки
              </span>
            )}
          </div>

          <div className="relative rounded-3xl border border-neutral-900 bg-neutral-950/80 px-3 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.75)]">
            {/* фон-сетка */}
            <div className="pointer-events-none absolute inset-0 opacity-[0.16] bg-[radial-gradient(circle_at_1px_1px,#ffffff22_1px,transparent_0)] [background-size:18px_18px]" />

            {totalManagers === 0 ? (
              <div className="relative z-10 flex items-center justify-between gap-3 px-1 py-2">
                <div className="space-y-1">
                  <p className="text-sm text-neutral-200">
                    Пока нет ни одного менеджера в звонках.
                  </p>
                  <p className="text-[11px] text-neutral-500 max-w-md">
                    Подключи AmoCRM / Bitrix24 и налей трафик — CallX сам
                    подтянет людей из записей и построит по ним аналитику.
                  </p>
                </div>
              </div>
            ) : (
              <div className="relative z-10 flex items-center gap-3 overflow-x-auto scrollbar-thin scrollbar-thumb-neutral-700/70 scrollbar-track-transparent py-1.5 px-0.5">
                {managerStats.slice(0, 12).map((m) => (
                  <div
                    key={m.key}
                    className="flex flex-col items-center justify-start min-w-[100px] max-w-[120px] gap-1.5"
                  >
                    <div className="relative">
                      <div className="h-14 w-14 rounded-full bg-gradient-to-tr from-emerald-400 via-lime-300 to-emerald-500 p-[2px] shadow-[0_0_18px_rgba(74,222,128,0.7)]">
                        <div className="h-full w-full rounded-full bg-neutral-950 flex items-center justify-center text-[13px] font-semibold text-neutral-100">
                          {m.name?.[0]?.toUpperCase() || "M"}
                        </div>
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-neutral-950 flex items-center justify-center text-[11px]">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      </div>
                    </div>
                    <div className="w-full text-center space-y-0.5">
                      <div className="truncate text-[11px] text-neutral-200">
                        {m.name}
                      </div>
                      <div className="text-[10px] text-neutral-500">
                        Звонков: {m.totalCalls}
                        {m.avgScore ? ` · Score: ${m.avgScore}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
                {totalManagers > 12 && (
                  <div className="flex flex-col items-center justify-center min-w-[80px] gap-1.5">
                    <div className="h-14 w-14 rounded-full border border-dashed border-neutral-700 flex items-center justify-center text-[12px] text-neutral-400">
                      +{totalManagers - 12}
                    </div>
                    <div className="text-[10px] text-neutral-500 text-center">
                      ещё менеджеры
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* СПИСОК МЕНЕДЖЕРОВ + СТАТИСТИКА */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">
              Менеджеры из звонков
            </h2>
            {totalManagers > 0 && (
              <span className="text-[11px] text-neutral-500">
                Данные по каждому человеку: звонки, DONE, средний score
              </span>
            )}
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/85 overflow-hidden shadow-[0_18px_50px_rgba(0,0,0,0.8)] text-xs sm:text-sm">
            <div className="grid grid-cols-4 px-3 sm:px-4 py-2.5 bg-neutral-950/95 text-neutral-500 text-[11px] uppercase tracking-wide">
              <div>Менеджер</div>
              <div className="hidden sm:block">Контакты</div>
              <div className="text-center">Звонки / DONE</div>
              <div className="text-right">Score / слабые</div>
            </div>

            {totalManagers === 0 && (
              <div className="px-3 sm:px-4 py-6 text-center text-[12px] text-neutral-500">
                Пока нет ни одного менеджера в звонках. Как только появятся
                записи из CRM, здесь появится рейтинг по людям.
              </div>
            )}

            {managerStats.map((m) => {
              const doneRate =
                m.totalCalls > 0
                  ? Math.round((m.doneCalls * 100) / m.totalCalls)
                  : 0;

              const lowShare =
                m.scoredCalls > 0
                  ? Math.round((m.lowScoreCalls * 100) / m.scoredCalls)
                  : 0;

              return (
                <div
                  key={m.key}
                  className="grid grid-cols-4 items-center px-3 sm:px-4 py-2.5 border-top border-neutral-900 text-neutral-200 hover:bg-neutral-900/70 transition-colors"
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

                  <div className="hidden sm:flex flex-col text-[11px] text-neutral-400">
                    {m.email ? (
                      <span className="truncate">{m.email}</span>
                    ) : (
                      <span className="text-neutral-600">Email: —</span>
                    )}
                    {m.phone ? (
                      <span className="truncate">{m.phone}</span>
                    ) : (
                      <span className="text-neutral-600">Телефон: —</span>
                    )}
                  </div>

                  <div className="text-center text-[11px] text-neutral-300">
                    {m.totalCalls} звонков
                    <br />
                    DONE: {m.doneCalls} ({doneRate}%)
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
        </section>
      </div>
    </Shell>
  );
}
