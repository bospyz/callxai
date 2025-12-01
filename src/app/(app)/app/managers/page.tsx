// src/app/(app)/app/managers/page.tsx

import Shell from "@/components/layout/Shell";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function createManager(formData: FormData) {
  "use server";

  const session = await auth();
  const companyId = (session?.user as any)?.companyId as string | undefined;

  if (!companyId) {
    throw new Error("Нет доступа к компании");
  }

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();

  if (!name) {
    throw new Error("Имя менеджера обязательно");
  }

  await db.manager.create({
    data: {
      name,
      email: email || null,
      phone: phone || null,
      companyId,
    },
  });

  revalidatePath("/app/managers");
  redirect("/app/managers");
}

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

  const managers = await db.manager.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <Shell>
      <div className="mx-auto w-full max-w-none py-8 sm:py-10 lg:py-12 px-4 sm:px-6 lg:px-10 xl:px-16">
        {/* HEADER */}
        <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2.5">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950/90 px-3.5 py-1.5 text-[11px] text-neutral-400 shadow-[0_0_26px_rgba(34,197,94,0.25)]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Список менеджеров компании</span>
              <span className="hidden sm:inline text-[10px] text-neutral-500">
                эти люди попадут в отчёты CallX
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-neutral-50">
              Менеджеры
            </h1>
            <p className="text-sm text-neutral-400 max-w-2xl">
              Следи, чтобы у каждого менеджера были нормальные имя и контакты —
              тогда в аналитике CallX не будет &quot;без менеджера&quot; и
              мусора в отчётах.
            </p>
          </div>

          <div className="text-xs text-neutral-500 flex flex-col items-start md:items-end gap-1.5">
            <div>
              Всего менеджеров:{" "}
              <span className="text-neutral-200 font-medium">
                {managers.length}
              </span>
            </div>
            {managers.length === 0 ? (
              <span className="text-[11px] text-neutral-500">
                Добавь хотя бы одного менеджера, чтобы оживить отчёты.
              </span>
            ) : (
              <span className="text-[11px] text-emerald-300/80">
                CallX уже готов считать рейтинг по людям — осталось налить
                звонков.
              </span>
            )}
          </div>
        </header>

        {/* СТОРИС-СТРИП ПО МЕНЕДЖЕРАМ */}
        <section className="mb-7">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Команда отдела продаж
            </h2>
            {managers.length > 0 && (
              <span className="text-[11px] text-neutral-500">
                Твои люди на первой линии
              </span>
            )}
          </div>

          <div className="relative rounded-3xl border border-neutral-900 bg-neutral-950/80 px-3 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.75)]">
            {/* фон-сетка */}
            <div className="pointer-events-none absolute inset-0 opacity-[0.16] bg-[radial-gradient(circle_at_1px_1px,#ffffff22_1px,transparent_0)] [background-size:18px_18px]" />

            {managers.length === 0 ? (
              <div className="relative z-10 flex items-center justify-between gap-3 px-1 py-2">
                <div className="space-y-1">
                  <p className="text-sm text-neutral-200">
                    Пока нет ни одного менеджера.
                  </p>
                  <p className="text-[11px] text-neutral-500 max-w-md">
                    Добавь хотя бы одного — и CallX начнёт строить аналитику по
                    людям: кто тащит, а кто сливает лиды.
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-2 text-[11px] text-neutral-500">
                  <span className="h-7 w-7 rounded-full border border-dashed border-neutral-700 flex items-center justify-center">
                    +
                  </span>
                  <span>Заполни форму ниже, чтобы собрать состав</span>
                </div>
              </div>
            ) : (
              <div className="relative z-10 flex items-center gap-3 overflow-x-auto scrollbar-thin scrollbar-thumb-neutral-700/70 scrollbar-track-transparent py-1.5 px-0.5">
                {managers.slice(0, 12).map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-col items-center justify-start min-w-[72px] max-w-[80px] gap-1.5"
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
                    <div className="w-full text-center">
                      <div className="truncate text-[11px] text-neutral-200">
                        {m.name}
                      </div>
                      {m.email && (
                        <div className="truncate text-[10px] text-neutral-500">
                          {m.email}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {managers.length > 12 && (
                  <div className="flex flex-col items-center justify-center min-w-[80px] gap-1.5">
                    <div className="h-14 w-14 rounded-full border border-dashed border-neutral-700 flex items-center justify-center text-[12px] text-neutral-400">
                      +{managers.length - 12}
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

        {/* ФОРМА ДОБАВЛЕНИЯ */}
        <section className="mb-7">
          <form
            action={createManager}
            className="rounded-2xl border border-neutral-800 bg-neutral-950/85 px-4 sm:px-5 py-4 sm:py-5 shadow-[0_18px_40px_rgba(0,0,0,0.7)] flex flex-col gap-3 sm:gap-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-0.5">
                <h2 className="text-sm font-medium text-neutral-100">
                  Добавить менеджера
                </h2>
                <p className="text-[11px] text-neutral-500 max-w-md">
                  Минимум — имя. Почту и телефон лучше заполнить сразу, чтобы в
                  отчётах не было &quot;серых&quot; менеджеров без контактов.
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-neutral-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>Можно добавлять сколько угодно людей</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2.5 sm:gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-neutral-400">
                  Имя менеджера*
                </label>
                <input
                  name="name"
                  required
                  placeholder="Например: Айдана, Тимур"
                  className="h-9 rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none focus:border-emerald-400 focus:ring-0"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-neutral-400">
                  Email (по желанию)
                </label>
                <input
                  name="email"
                  type="email"
                  placeholder="manager@company.com"
                  className="h-9 rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none focus:border-emerald-400 focus:ring-0"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-neutral-400">
                  Телефон (по желанию)
                </label>
                <input
                  name="phone"
                  placeholder="+7..."
                  className="h-9 rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none focus:border-emerald-400 focus:ring-0"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="h-9 px-4 sm:px-5 rounded-xl bg-gradient-to-r from-emerald-400 to-lime-300 text-[13px] font-semibold text-black shadow-[0_0_22px_rgba(74,222,128,0.5)] hover:brightness-105 transition"
                >
                  Добавить
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* СПИСОК МЕНЕДЖЕРОВ */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">
              Текущий список
            </h2>
            {managers.length > 0 && (
              <span className="text-[11px] text-neutral-500">
                Вся команда в одном месте
              </span>
            )}
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/85 overflow-hidden shadow-[0_18px_50px_rgba(0,0,0,0.8)] text-xs sm:text-sm">
            <div className="grid grid-cols-3 sm:grid-cols-4 px-3 sm:px-4 py-2.5 bg-neutral-950/95 text-neutral-500 text-[11px] uppercase tracking-wide">
              <div>Имя</div>
              <div>Email</div>
              <div>Телефон</div>
              <div className="hidden sm:block text-right">Создан</div>
            </div>

            {managers.length === 0 && (
              <div className="px-3 sm:px-4 py-6 text-center text-[12px] text-neutral-500">
                Пока нет ни одного менеджера. Добавь хотя бы одного, чтобы
                отчёты CallX выглядели осмысленно.
              </div>
            )}

            {managers.map((m) => (
              <div
                key={m.id}
                className="grid grid-cols-3 sm:grid-cols-4 items-center px-3 sm:px-4 py-2.5 border-t border-neutral-900 text-neutral-200 hover:bg-neutral-900/70 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-[11px] text-neutral-200">
                    {m.name?.[0]?.toUpperCase() || "M"}
                  </div>
                  <span className="truncate">{m.name}</span>
                </div>
                <div className="truncate text-neutral-300">
                  {m.email || <span className="text-neutral-600">—</span>}
                </div>
                <div className="truncate text-neutral-300">
                  {m.phone || <span className="text-neutral-600">—</span>}
                </div>
                <div className="hidden sm:flex justify-end text-[11px] text-neutral-500">
                  {m.createdAt
                    ? new Date(m.createdAt).toLocaleDateString("ru-RU")
                    : "—"}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Shell>
  );
}
