"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password,
        companyName,
        phone,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Ошибка регистрации");
      return;
    }

    router.push("/auth/login");
  }

  return (
    <main className="min-h-screen w-full bg-black text-neutral-50 relative overflow-hidden">
      {/* Градиентный фон + сетка */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,_rgba(34,197,94,0.35),_transparent)] blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.3),_transparent)] blur-3xl" />
        <div className="absolute inset-0 opacity-[0.08] [background-image:radial-gradient(circle_at_1px_1px,#27272a_1px,transparent_0)] [background-size:16px_16px]" />
      </div>

      {/* Статичный хедер-«островок» */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 sm:px-10 py-4 backdrop-blur-xl bg-black/40 border-b border-neutral-900/60">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-400 to-lime-300 shadow-[0_0_40px_rgba(74,222,128,0.7)] flex items-center justify-center text-xs font-black tracking-tight text-black">
            CX
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">
              callx ai
            </p>
            <p className="text-[11px] text-neutral-500">
              Автоанализ продаж без лишней боли
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-3 text-[11px] text-neutral-400">
          <span className="px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-[10px] uppercase tracking-wide">
            setup
          </span>
          <span className="hidden md:inline">
            5 минут — и отдел продаж уже под микроскопом
          </span>
        </div>
      </header>

      {/* Основной контент */}
      <div className="relative z-10 flex items-center justify-center px-4 sm:px-6 lg:px-10 py-10">
        <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-10 lg:gap-14 items-center">
          {/* Левая часть — смысл регистрации */}
          <section className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950/60 px-3 py-1 text-[11px] text-neutral-400 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Подключи отдел продаж к CallX</span>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold leading-tight">
                Создай аккаунт{" "}
                <span className="bg-gradient-to-r from-emerald-400 to-lime-300 bg-clip-text text-transparent">
                  CallX
                </span>{" "}
                и узнай, кто реально продаёт, а кто просто говорит.
              </h1>
              <p className="text-sm sm:text-base text-neutral-400 max-w-xl">
                После регистрации подключишь amoCRM, загрузишь звонки, а CallX
                сам посчитает качество разговоров, конверсии и покажет слабые
                места в скриптах.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-neutral-300">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-3 backdrop-blur">
                <p className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
                  для кого
                </p>
                <p className="font-semibold">руководители отделов продаж</p>
                <p className="text-[11px] text-neutral-500">
                  чтобы видеть отдел не по «ощущениям», а по данным.
                </p>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-3 backdrop-blur">
                <p className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
                  подключение
                </p>
                <p className="font-semibold">amoCRM + записи звонков</p>
                <p className="text-[11px] text-neutral-500">
                  подгружаем историю и сразу считаем отчёты.
                </p>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-3 backdrop-blur sm:col-span-1 col-span-2">
                <p className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
                  результат
                </p>
                <p className="font-semibold">честный срез по менеджерам</p>
                <p className="text-[11px] text-neutral-500">
                  видно, кто тащит, а кого давно пора учить продавать.
                </p>
              </div>
            </div>

            <p className="text-[11px] text-neutral-500">
              Регистрация займёт 2–3 минуты. Никаких карт, только данные по
              компании и контакт.
            </p>
          </section>

          {/* Правая часть — форма регистрации */}
          <section>
            <div className="relative">
              {/* Градиентная подложка карточки */}
              <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-br from-emerald-500/50 via-lime-300/40 to-sky-500/40 opacity-60 blur-[3px]" />

              <div className="relative rounded-3xl border border-neutral-800/90 bg-neutral-950/90 px-6 sm:px-7 py-6 sm:py-7 shadow-[0_18px_60px_rgba(0,0,0,0.85)] backdrop-blur-xl">
                <div className="mb-5">
                  <h2 className="text-lg sm:text-xl font-semibold">
                    Регистрация{" "}
                    <span className="text-emerald-400">
                      CallX<span className="text-neutral-50"> AI</span>
                    </span>
                  </h2>
                  <p className="text-xs text-neutral-500 mt-1.5">
                    Укажи свои данные и компанию — на них мы будем готовить
                    отчёты и доступы.
                  </p>
                </div>

                {error && (
                  <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                      <span className="font-medium">
                        Ошибка регистрации
                      </span>
                    </div>
                    <p className="mt-1.5 leading-snug">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-3.5">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-neutral-400">
                      Ваше имя
                    </label>
                    <Input
                      placeholder="Как к тебе обращаться"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="bg-black/40 border-neutral-800 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-neutral-400">
                      Компания
                    </label>
                    <Input
                      placeholder="Название компании"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      required
                      className="bg-black/40 border-neutral-800 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-neutral-400">
                      Телефон компании (опционально)
                    </label>
                    <Input
                      placeholder="+7..."
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="bg-black/40 border-neutral-800 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-neutral-400">
                      Email
                    </label>
                    <Input
                      placeholder="work@company.com"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="bg-black/40 border-neutral-800 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-neutral-400">
                      Пароль
                    </label>
                    <Input
                      placeholder="Минимум 6 символов"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="bg-black/40 border-neutral-800 text-sm"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-2 text-sm font-semibold tracking-wide disabled:opacity-70"
                  >
                    {loading ? "Создаём аккаунт..." : "Создать аккаунт"}
                  </Button>
                </form>

                <div className="mt-5 flex flex-col gap-2 text-[11px] text-neutral-500">
                  <div>
                    Уже есть аккаунт?{" "}
                    <Link
                      href="/auth/login"
                      className="text-neutral-100 hover:text-white underline underline-offset-2"
                    >
                      Войти
                    </Link>
                  </div>
                  <p className="text-[10px] text-neutral-600">
                    Создавая аккаунт, ты подтверждаешь, что готов смотреть на
                    свой отдел продаж без розовых очков.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
