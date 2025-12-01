// src/app/(app)/app/settings/page.tsx

import Shell from "@/components/layout/Shell";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// ==========================
// UPDATE COMPANY INFO
// ==========================
async function updateCompany(formData: FormData) {
  "use server";

  const session = await auth();
  const companyId = (session?.user as any)?.companyId as string | undefined;

  if (!companyId) throw new Error("Нет доступа");

  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();

  await db.company.update({
    where: { id: companyId },
    data: {
      name,
      phone: phone || null,
    },
  });

  revalidatePath("/app/settings");
  redirect("/app/settings");
}

// ==========================
// UPDATE PASSWORD
// ==========================
async function changePassword(formData: FormData) {
  "use server";

  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) throw new Error("Нет доступа");

  const newPass = String(formData.get("newPass") || "").trim();
  if (newPass.length < 6) {
    throw new Error("Пароль должен быть не менее 6 символов");
  }

  // TODO: заменить на реальное хэширование пароля
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: newPass as any },
  });

  revalidatePath("/app/settings");
  redirect("/app/settings");
}

// ==========================
// PAGE
// ==========================
export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  const where: { id?: string; email?: string } = {};
  if ((session.user as any).id) {
    where.id = (session.user as any).id as string;
  } else if (session.user.email) {
    where.email = session.user.email as string;
  }

  if (!where.id && !where.email) {
    return (
      <Shell>
        <div className="mx-auto max-w-4xl py-10 px-4 sm:px-6">
          <div className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-6 text-sm text-red-100 shadow-[0_18px_40px_rgba(0,0,0,0.7)]">
            <h1 className="mb-1 text-lg font-semibold">Нет доступа</h1>
            <p className="text-[13px] text-red-100/80">
              Не удалось определить пользователя. Попробуй выйти и зайти в
              систему заново.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  const user = await db.user.findUnique({ where: where as any });

  const company = user?.companyId
    ? await db.company.findUnique({ where: { id: user.companyId } })
    : null;

  const displayName = user?.name || user?.email || "Пользователь";

  return (
    <Shell>
      <main className="mx-auto w-full max-w-10xl py-10 px-4 sm:px-8 lg:px-12 xl:px-16 text-neutral-50 space-y-8">
        {/* HEADER */}
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-900 bg-neutral-950/95 px-3.5 py-1.5 text-[11px] text-neutral-400 shadow-[0_0_22px_rgba(34,197,94,0.35)]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Настройки аккаунта · CallX</span>
              {company?.name && (
                <span className="hidden sm:inline text-[10px] text-neutral-500">
                  {company.name}
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight">
              Настройки
            </h1>
            <p className="text-sm text-neutral-500 max-w-xl">
              Профиль, компания, безопасность и базовая информация о рабочем
              пространстве.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-neutral-900 bg-neutral-950/90 px-3.5 py-3 text-xs">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 border border-neutral-800 text-[13px] font-medium text-neutral-100">
              {displayName[0]?.toUpperCase() || "U"}
            </div>
            <div className="flex flex-col">
              <span className="text-[13px] font-medium text-neutral-50 truncate max-w-[180px] sm:max-w-[220px]">
                {displayName}
              </span>
              <span className="text-[11px] text-neutral-500">
                ID: {user?.id?.slice(0, 8) ?? "—"} · роль: пользователь
              </span>
            </div>
          </div>
        </header>

        <div className="grid gap-7 lg:grid-cols-[1.4fr_1fr]">
          {/* LEFT COLUMN = профиль + компания */}
          <div className="space-y-7">
            {/* PROFILE */}
            <section className="rounded-3xl border border-neutral-900 bg-neutral-950/95 p-6 shadow-[0_18px_40px_rgba(0,0,0,0.8)]">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-100">
                    Профиль
                  </h2>
                  <p className="text-xs text-neutral-500">
                    Основная информация о твоём аккаунте CallX.
                  </p>
                </div>
                <span className="rounded-full bg-neutral-900 px-3 py-1 text-[11px] text-neutral-400">
                  Email подтверждён
                </span>
              </div>

              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <label className="text-[11px] text-neutral-500">Имя</label>
                  <input
                    disabled
                    value={user?.name || ""}
                    className="mt-1 h-9 w-full rounded-xl border border-neutral-900 bg-neutral-900 px-3 text-sm text-neutral-300"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-neutral-500">Email</label>
                  <input
                    disabled
                    value={user?.email || ""}
                    className="mt-1 h-9 w-full rounded-xl border border-neutral-900 bg-neutral-900 px-3 text-sm text-neutral-300"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-neutral-500">
                    ID компании
                  </label>
                  <input
                    disabled
                    value={user?.companyId || "—"}
                    className="mt-1 h-9 w-full rounded-xl border border-neutral-900 bg-neutral-900 px-3 text-sm text-neutral-300"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-neutral-500">
                    Внутренний ID пользователя
                  </label>
                  <input
                    disabled
                    value={user?.id || "—"}
                    className="mt-1 h-9 w-full rounded-xl border border-neutral-900 bg-neutral-900 px-3 text-[11px] text-neutral-400"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-neutral-400">
                <span className="inline-flex items-center rounded-full bg-neutral-900 px-2.5 py-1">
                  🔐 Авторизация через email + пароль
                </span>
                <span className="inline-flex items-center rounded-full bg-neutral-900 px-2.5 py-1">
                  🧩 Привязка к компании:{" "}
                  {company?.name ?? "не указана"}
                </span>
              </div>
            </section>

            {/* COMPANY SETTINGS */}
            {company && (
              <section className="rounded-3xl border border-neutral-900 bg-neutral-950/95 p-6 shadow-[0_18px_40px_rgba(0,0,0,0.8)]">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-neutral-100">
                      Компания
                    </h2>
                    <p className="text-xs text-neutral-500">
                      Обнови данные рабочей компании — они попадают в счета и
                      отчёты.
                    </p>
                  </div>
                  <span className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-[11px] text-neutral-400">
                    ID: {company.id.slice(0, 8)}
                  </span>
                </div>

                <form action={updateCompany} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-[11px] text-neutral-500">
                        Название компании
                      </label>
                      <input
                        name="name"
                        defaultValue={company.name}
                        className="mt-1 h-9 w-full rounded-xl border border-neutral-900 bg-neutral-900 px-3 text-sm text-neutral-100 outline-none focus:border-emerald-400"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-neutral-500">
                        Телефон компании
                      </label>
                      <input
                        name="phone"
                        defaultValue={company.phone || ""}
                        placeholder="+7..."
                        className="mt-1 h-9 w-full rounded-xl border border-neutral-900 bg-neutral-900 px-3 text-sm text-neutral-100 outline-none focus:border-emerald-400"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="mt-3 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-400 to-lime-300 px-5 py-2 text-sm font-semibold text-black shadow-[0_0_22px_rgba(74,222,128,0.5)] hover:brightness-105 transition"
                  >
                    Сохранить изменения
                  </button>
                </form>
              </section>
            )}
          </div>

          {/* RIGHT COLUMN = безопасность + подсказки */}
          <div className="space-y-7">
            {/* SECURITY */}
            <section className="rounded-3xl border border-neutral-900 bg-neutral-950/95 p-6 shadow-[0_18px_40px_rgba(0,0,0,0.8)]">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-100">
                    Безопасность
                  </h2>
                  <p className="text-xs text-neutral-500">
                    Обнови пароль для входа в CallX.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-neutral-900 px-3 py-1 text-[11px] text-neutral-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Пароль можно сменить в любой момент
                </span>
              </div>

              <form action={changePassword} className="space-y-4 max-w-sm">
                <div>
                  <label className="text-[11px] text-neutral-500">
                    Новый пароль
                  </label>
                  <input
                    name="newPass"
                    type="password"
                    placeholder="Минимум 6 символов"
                    className="mt-1 h-9 w-full rounded-xl border border-neutral-900 bg-neutral-900 px-3 text-sm text-neutral-100 outline-none focus:border-emerald-400"
                  />
                </div>

                <button
                  type="submit"
                  className="mt-2 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-400 to-lime-300 px-5 py-2 text-sm font-semibold text-black shadow-[0_0_22px_rgba(74,222,128,0.5)] hover:brightness-105 transition"
                >
                  Обновить пароль
                </button>
              </form>

              <div className="mt-5 space-y-2 text-[11px] text-neutral-500">
                <p className="font-medium text-neutral-300">
                  Советы по безопасности:
                </p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Не используй тот же пароль, что и в почте / банке.</li>
                  <li>Раз в 2–3 месяца обновляй пароль в CallX.</li>
                  <li>
                    Не передавай логин и пароль менеджерам — создавай им отдельные
                    аккаунты.
                  </li>
                </ul>
              </div>
            </section>

            {/* INFO / STORY CARD */}
            <section className="rounded-3xl border border-neutral-900 bg-neutral-950/95 p-6 shadow-[0_18px_40px_rgba(0,0,0,0.8)] text-[12px] text-neutral-400 space-y-3">
              <h3 className="text-sm font-semibold text-neutral-100">
                Что даёт эта страница
              </h3>
              <ul className="space-y-2">
                <li className="flex gap-2">
                  <span className="mt-[5px] h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>
                    Через блок{" "}
                    <span className="text-neutral-200">«Компания»</span> ты
                    поддерживаешь в актуале название и телефон — они используются
                    в счетах, договорах и отчётах.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-[5px] h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>
                    В блоке{" "}
                    <span className="text-neutral-200">«Профиль»</span> можно
                    быстро посмотреть все технические ID, когда общаешься с
                    поддержкой.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-[5px] h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>
                    Раз в неделю заглядывай сюда: убедись, что данные компании и
                    доступы в порядке, особенно когда меняются люди в отделе.
                  </span>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </main>
    </Shell>
  );
}
