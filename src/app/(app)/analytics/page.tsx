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
        <h1 className="text-2xl font-bold">Нет доступа</h1>
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
      <h1 className="text-2xl font-bold mb-4">Аналитика</h1>

      <div className="grid gap-4 md:grid-cols-5 text-sm mb-6">
        <Card label="Всего звонков" value={totalCalls} />
        <Card label="Успешные (DONE)" value={doneCalls} />
        <Card label="Ошибки (ERROR)" value={errorCalls} />
        <Card label="В работе" value={inProgressCalls} />
        <Card
          label="Средний скоринг"
          value={avgScore !== null ? `${avgScore}/100` : ""}
        />
      </div>

      {topManagers.length > 0 && (
        <div className="mt-2">
          <h2 className="text-sm font-semibold text-neutral-300 mb-2">
            Топ менеджеров по количеству звонков
          </h2>
          <div className="border border-neutral-900 rounded-2xl overflow-hidden text-xs">
            <div className="grid grid-cols-3 px-3 py-2 bg-neutral-950 text-neutral-500">
              <div>Менеджер</div>
              <div>Звонков</div>
              <div>Средний скоринг</div>
            </div>
            {topManagers.map((m) => (
              <div
                key={m.id}
                className="grid grid-cols-3 px-3 py-2 border-t border-neutral-900 text-neutral-300"
              >
                <div>{m.name}</div>
                <div>{m.calls}</div>
                <div>{m.avgScore ?? ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
}

function Card({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="border border-neutral-900 rounded-2xl p-4">
      <div className="text-neutral-500 text-xs mb-1">{label}</div>
      <div className="text-lg font-semibold text-neutral-100">
        {value}
      </div>
    </div>
  );
}
