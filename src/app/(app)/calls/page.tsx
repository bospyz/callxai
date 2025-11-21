import Shell from "@/components/layout/Shell";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CallStatus } from "@prisma/client";
import Link from "next/link";

const STATUS_LABELS: Record<CallStatus, string> = {
  NEW: "Новый",
  PROCESSING: "В обработке",
  DONE: "Готов",
  ERROR: "Ошибка",
};

const STATUS_CLASSES: Record<CallStatus, string> = {
  NEW: "border-neutral-700 text-neutral-300",
  PROCESSING: "border-blue-500 text-blue-400",
  DONE: "border-emerald-500 text-emerald-400",
  ERROR: "border-red-500 text-red-400",
};

export default async function CallsPage() {
  const session = await auth();
  const companyId = (session?.user as any)?.companyId as string | undefined;

  if (!companyId) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold">Нет доступа</h1>
      </Shell>
    );
  }

  const calls = await db.call.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <Shell>
      <h1 className="text-2xl font-bold mb-4">Звонки</h1>

      {calls.length === 0 ? (
        <div className="text-sm text-neutral-500">
          Звонков пока нет. Подключи amoCRM и дождись импорта.
        </div>
      ) : (
        <div className="border border-neutral-900 rounded-2xl overflow-hidden text-sm">
          <div className="grid grid-cols-5 px-3 py-2 bg-neutral-950 text-neutral-500">
            <div>Дата</div>
            <div>Статус</div>
            <div>Счёт</div>
            <div>Телефон</div>
            <div>Детали</div>
          </div>
          {calls.map((call) => {
            const status = call.status as CallStatus;
            return (
              <div
                key={call.id}
                className="grid grid-cols-5 px-3 py-2 border-t border-neutral-900 text-neutral-200"
              >
                <div>
                  {new Date(call.createdAt).toLocaleString("ru-RU", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </div>
                <div>
                  <span
                    className={
                      "inline-flex items-center px-2 py-0.5 rounded-full border text-xs " +
                      STATUS_CLASSES[status]
                    }
                  >
                    {STATUS_LABELS[status]}
                  </span>
                </div>
                <div>{call.score ?? "-"}</div>
                <div>{(call.meta as any)?.phone ?? "-"}</div>
                <div>
                  <Link
                    href={`/app/calls/${call.id}`}
                    className="text-xs text-neutral-400 hover:text-neutral-200 underline"
                  >
                    Открыть
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
