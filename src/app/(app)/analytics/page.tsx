import Shell from "@/components/layout/Shell";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CallStatus } from "@prisma/client";

export default async function AnalyticsPage() {
  const session = await auth();
  const companyId = (session?.user as any)?.companyId as string | undefined;

  if (!companyId) {
    return (
      <Shell>
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-xl sm:text-2xl font-semibold">
            Нет доступа
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            Авторизуйся под рабочим аккаунтом компании, чтобы видеть аналитику.
          </p>
        </div>
      </Shell>
    );
  }

  // Базовые метрики
  const [totalCalls, doneCalls, errorCalls, inProgressCalls] =
    await Promise.all([
      db.call.count({ where: { companyId } }),
      db.call.count({
        where: { companyId, status: CallStatus.DONE },
      }),
      db.call.count({
        where: { companyId, status: CallStatus.ERROR }, // вместо FAILED
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

  const topManagers = managersAgg.map((m) => {
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

  return (
    <Shell>
      <main className="px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        {/* Хедер */}
        <div className="mb-5 sm:mb-7">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight">
            Аналитика по звонкам
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-neutral-500 max-w-xl">
            Короткая сводка по работе CallX: сколько звонков уже разобрано,
            где ошибки и какой средний score по отделу.
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
          <section className="mt-2">
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
                    <div className="text-right sm:text-left">{m.calls}</div>
                    <div className="text-right">
                      {m.avgScore != null ? `${m.avgScore}/100` : "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
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
