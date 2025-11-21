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
        <div className="mx-auto max-w-4xl py-10">
          <div className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-6 text-sm text-red-100">
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
      <div className="mx-auto w-full max-w-6xl py-8 sm:py-10 lg:py-12 px-4 sm:px-6 lg:px-0">
        {/* HEADER */}
        <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950/80 px-3 py-1 text-[11px] text-neutral-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Список менеджеров компании</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-50">
              Менеджеры
            </h1>
            <p className="text-sm text-neutral-400 max-w-xl">
              Эти люди попадают в отчёты CallX. Следи за тем, чтобы у каждого
              менеджера были корректные имя и контакты — так аналитика будет
              чище.
            </p>
          </div>

          <div className="text-xs text-neutral-500">
            Всего менеджеров:{" "}
            <span className="text-neutral-200 font-medium">
              {managers.length}
            </span>
          </div>
        </header>

        {/* ФОРМА ДОБАВЛЕНИЯ */}
        <section className="mb-6">
          <form
            action={createManager}
            className="rounded-2xl border border-neutral-800 bg-neutral-950/80 px-4 sm:px-5 py-4 sm:py-5 shadow-[0_18px_40px_rgba(0,0,0,0.7)] flex flex-col gap-3 sm:gap-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-0.5">
                <h2 className="text-sm font-medium text-neutral-100">
                  Добавить менеджера
                </h2>
                <p className="text-[11px] text-neutral-500 max-w-md">
                  Минимум — имя. Почту и телефон можно добавить позже, но лучше
                  заполнить сразу, чтобы не путаться в отчётах.
                </p>
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
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">
            Текущий список
          </h2>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 overflow-hidden shadow-[0_18px_50px_rgba(0,0,0,0.8)] text-xs sm:text-sm">
            <div className="grid grid-cols-3 sm:grid-cols-4 px-3 sm:px-4 py-2.5 bg-neutral-950/90 text-neutral-500 text-[11px] uppercase tracking-wide">
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
