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
        <main className="px-4 py-6 sm:px-6 lg:px-10">
          <h1 className="text-xl sm:text-2xl font-semibold">Нет доступа</h1>
          <p className="mt-2 text-sm text-neutral-500 max-w-md">
            Войди в рабочий кабинет компании, чтобы видеть звонки и аналитику.
          </p>
        </main>
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
      <main className="px-4 py-5 sm:px-6 lg:px-10 lg:py-7">
        {/* HEADER */}
        <header className="mb-5 sm:mb-7 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight">
              Звонки
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-neutral-500 max-w-xl">
              Последние 50 звонков, которые CallX забрал из телефонии / CRM.
              Смотри статус обработки и проваливайся в детали разговора.
            </p>
          </div>

          {calls.length > 0 && (
            <div className="mt-2 sm:mt-0 text-[11px] sm:text-xs text-neutral-500">
              Показано{" "}
              <span className="font-medium text-neutral-200">
                {calls.length}
              </span>{" "}
              последних звонков.
            </div>
          )}
        </header>

        {/* EMPTY STATE */}
        {calls.length === 0 ? (
          <div className="border border-neutral-900 rounded-2xl bg-neutral-950/70 px-4 py-5 sm:px-5 sm:py-6 text-sm text-neutral-300">
            <p>
              Звонков пока нет. Подключи amoCRM или телефонию в разделе{" "}
              <Link
                href="/app/integrations"
                className="underline underline-offset-2 text-neutral-100 hover:text-emerald-300"
              >
                «Интеграции»
              </Link>{" "}
              и дождись первого импорта.
            </p>
          </div>
        ) : (
          <>
            {/* DESKTOP / LAPTOP: TABLE VIEW */}
            <section className="hidden md:block">
              <div className="border border-neutral-900 rounded-2xl overflow-hidden bg-black/40 text-sm">
                {/* header row */}
                <div className="grid grid-cols-[1.6fr_1.1fr_0.7fr_1.1fr_0.9fr] px-4 py-2.5 bg-neutral-950 text-[11px] uppercase tracking-wide text-neutral-500">
                  <div>Дата и время</div>
                  <div>Статус</div>
                  <div>Score</div>
                  <div>Телефон</div>
                  <div className="text-right">Детали</div>
                </div>

                {/* rows */}
                {calls.map((call) => {
                  const status = call.status as CallStatus;
                  const phone = (call.meta as any)?.phone ?? "—";

                  return (
                    <div
                      key={call.id}
                      className="grid grid-cols-[1.6fr_1.1fr_0.7fr_1.1fr_0.9fr] items-center px-4 py-2.5 border-t border-neutral-900 text-neutral-200 bg-black/30 hover:bg-neutral-900/70 transition-colors"
                    >
                      {/* Дата */}
                      <div className="text-xs text-neutral-300">
                        {new Date(call.createdAt).toLocaleString("ru-RU", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </div>

                      {/* Статус */}
                      <div>
                        <span
                          className={
                            "inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] whitespace-nowrap " +
                            STATUS_CLASSES[status]
                          }
                        >
                          {STATUS_LABELS[status]}
                        </span>
                      </div>

                      {/* Score */}
                      <div className="text-xs">
                        {call.score != null ? `${call.score}/100` : "—"}
                      </div>

                      {/* Телефон */}
                      <div className="text-xs text-neutral-300">
                        {phone}
                      </div>

                      {/* Детали */}
                      <div className="text-right">
                        <Link
                          href={`/app/calls/${call.id}`}
                          className="text-[11px] text-neutral-400 hover:text-neutral-100 underline underline-offset-2"
                        >
                          Открыть
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* MOBILE / TABLET: CARD LIST VIEW */}
            <section className="space-y-3 md:hidden">
              {calls.map((call) => {
                const status = call.status as CallStatus;
                const phone = (call.meta as any)?.phone ?? "—";

                return (
                  <div
                    key={call.id}
                    className="rounded-2xl border border-neutral-900 bg-neutral-950/80 px-4 py-3 text-xs text-neutral-200 shadow-[0_14px_40px_rgba(0,0,0,0.7)]"
                  >
                    {/* верхняя строка: дата + статус */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] text-neutral-500">
                          {new Date(call.createdAt).toLocaleDateString(
                            "ru-RU",
                            {
                              day: "2-digit",
                              month: "short",
                            }
                          )}
                        </span>
                        <span className="text-[12px] text-neutral-100">
                          {new Date(call.createdAt).toLocaleTimeString(
                            "ru-RU",
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )}
                        </span>
                      </div>
                      <span
                        className={
                          "inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] whitespace-nowrap " +
                          STATUS_CLASSES[status]
                        }
                      >
                        {STATUS_LABELS[status]}
                      </span>
                    </div>

                    {/* middle: телефон + score */}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                          Телефон
                        </span>
                        <span className="text-[12px] text-neutral-200">
                          {phone}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                          Score
                        </span>
                        <span className="text-[12px] text-neutral-100">
                          {call.score != null ? `${call.score}/100` : "—"}
                        </span>
                      </div>
                    </div>

                    {/* bottom: ссылка */}
                    <div className="mt-2 pt-2 border-t border-neutral-900 flex items-center justify-between">
                      <span className="text-[10px] text-neutral-500">
                        ID:{" "}
                        <span className="text-neutral-400">
                          {call.id.slice(0, 8)}…
                        </span>
                      </span>
                      <Link
                        href={`/app/calls/${call.id}`}
                        className="text-[11px] text-emerald-300 hover:text-emerald-200 underline underline-offset-2"
                      >
                        Открыть разбор
                      </Link>
                    </div>
                  </div>
                );
              })}
            </section>
          </>
        )}
      </main>
    </Shell>
  );
}
