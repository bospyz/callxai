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

  // ВАЖНО: здесь зависит от твоей схемы.
  // Если у тебя поле passwordHash — нужно хэшировать.
  // Сейчас тупо сохраняем как есть (как в MVP).
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

  // Если вообще нет сессии — выкидываем на логин
  if (!session?.user) {
    redirect("/auth/login");
  }

  // Собираем where так, чтобы Prisma точно не получил undefined
  const where: { id?: string; email?: string } = {};
  if ((session.user as any).id) {
    where.id = (session.user as any).id as string;
  } else if (session.user.email) {
    where.email = session.user.email as string;
  }

  if (!where.id && !where.email) {
    // Страховка на случай, если в сессии вообще нет ни id, ни email
    return (
      <Shell>
        <div className="mx-auto max-w-4xl py-10">
          <div className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-6 text-sm text-red-100">
            <h1 className="text-lg font-semibold mb-1">Нет доступа</h1>
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

  return (
    <Shell>
      <div className="mx-auto w-full max-w-4xl py-10 px-4 sm:px-6">
        {/* HEADER */}
        <header className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950/70 px-3 py-1 text-[11px] text-neutral-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Настройки аккаунта</span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Настройки
          </h1>
          <p className="text-sm text-neutral-500">
            Профиль, компания, безопасность.
          </p>
        </header>

        <div className="space-y-10">
          {/* PROFILE */}
          <section className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-6 shadow-[0_18px_40px_rgba(0,0,0,0.7)]">
            <h2 className="text-lg font-semibold mb-3 text-neutral-100">
              Профиль
            </h2>
            <p className="text-xs text-neutral-500 mb-5">
              Основная информация о твоём аккаунте.
            </p>

            <div className="grid gap-4 text-sm">
              <div>
                <label className="text-xs text-neutral-500">Имя</label>
                <input
                  disabled
                  value={user?.name || ""}
                  className="mt-1 h-9 w-full rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 text-neutral-300"
                />
              </div>

              <div>
                <label className="text-xs text-neutral-500">Email</label>
                <input
                  disabled
                  value={user?.email || ""}
                  className="mt-1 h-9 w-full rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 text-neutral-300"
                />
              </div>

              <div>
                <label className="text-xs text-neutral-500">ID компании</label>
                <input
                  disabled
                  value={user?.companyId || "—"}
                  className="mt-1 h-9 w-full rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 text-neutral-300"
                />
              </div>
            </div>
          </section>

          {/* COMPANY SETTINGS */}
          {company && (
            <section className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-6 shadow-[0_18px_40px_rgba(0,0,0,0.7)]">
              <h2 className="text-lg font-semibold mb-3 text-neutral-100">
                Компания
              </h2>
              <p className="text-xs text-neutral-500 mb-5">
                Обнови данные своей компании.
              </p>

              <form action={updateCompany} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-neutral-500">
                      Название компании
                    </label>
                    <input
                      name="name"
                      defaultValue={company.name}
                      className="mt-1 h-9 w-full rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 text-sm text-neutral-100 outline-none focus:border-emerald-400"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-neutral-500">
                      Телефон компании
                    </label>
                    <input
                      name="phone"
                      defaultValue={company.phone || ""}
                      className="mt-1 h-9 w-full rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 text-sm text-neutral-100 outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="mt-3 rounded-xl bg-gradient-to-r from-emerald-400 to-lime-300 px-5 py-2 text-sm font-semibold text-black shadow-[0_0_22px_rgba(74,222,128,0.5)] hover:brightness-105 transition"
                >
                  Сохранить изменения
                </button>
              </form>
            </section>
          )}

          {/* SECURITY */}
          <section className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-6 shadow-[0_18px_40px_rgba(0,0,0,0.7)]">
            <h2 className="text-lg font-semibold mb-3 text-neutral-100">
              Безопасность
            </h2>
            <p className="text-xs text-neutral-500 mb-5">
              Измени пароль для входа в CallX.
            </p>

            <form action={changePassword} className="space-y-4 max-w-sm">
              <div>
                <label className="text-xs text-neutral-500">Новый пароль</label>
                <input
                  name="newPass"
                  type="password"
                  placeholder="Минимум 6 символов"
                  className="mt-1 h-9 w-full rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 text-sm text-neutral-100 outline-none focus:border-emerald-400"
                />
              </div>

              <button
                type="submit"
                className="mt-2 rounded-xl bg-gradient-to-r from-emerald-400 to-lime-300 px-5 py-2 text-sm font-semibold text-black shadow-[0_0_22px_rgba(74,222,128,0.5)] hover:brightness-105 transition"
              >
                Обновить пароль
              </button>
            </form>
          </section>
        </div>
      </div>
    </Shell>
  );
}
