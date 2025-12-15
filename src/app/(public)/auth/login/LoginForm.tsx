"use client";

import React, { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

type AuthErrorCode =
  | "CredentialsSignin"
  | "AccessDenied"
  | "Configuration"
  | "NetworkError"
  | "UnknownError"
  | string;

function humanizeAuthError(code: AuthErrorCode) {
  switch (code) {
    case "CredentialsSignin":
      return "Проверь почту и пароль — что-то не совпало.";
    case "AccessDenied":
      return "Доступ запрещён. Проверь права или обратись в поддержку.";
    case "Configuration":
      return "Ошибка конфигурации авторизации. Сообщи в поддержку.";
    case "NetworkError":
      return "Проблема с сетью/сервером. Попробуй ещё раз.";
    case "UnknownError":
      return "Не удалось выполнить вход. Попробуй ещё раз.";
    default:
      return code;
  }
}

export default function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");

  const [loading, setLoading] = useState<boolean>(false);
  const [formError, setFormError] = useState<AuthErrorCode | null>(null);

  const queryError = searchParams.get("error");

  const errorText = useMemo(() => {
    const code = (formError ?? queryError) as AuthErrorCode | null;
    return code ? humanizeAuthError(code) : null;
  }, [formError, queryError]);

  const canSubmit = useMemo(() => {
    const e = email.trim();
    const p = password.trim();
    return e.length > 3 && p.length > 0 && !loading;
  }, [email, password, loading]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (loading) return;

    setFormError(null);
    setLoading(true);

    try {
      const res = await signIn("credentials", {
        redirect: false,
        email: email.trim(),
        password,
        callbackUrl: "/app",
      });

      if (!res) {
        setFormError("UnknownError");
        return;
      }

      if (res.ok) {
        router.push(res.url || "/app");
        return;
      }

      setFormError((res.error as AuthErrorCode) || "UnknownError");
    } catch {
      setFormError("NetworkError");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen w-full bg-black text-neutral-50 relative overflow-hidden">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,_rgba(34,197,94,0.35),_transparent)] blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.3),_transparent)] blur-3xl" />
        <div className="absolute inset-0 opacity-[0.08] [background-image:radial-gradient(circle_at_1px_1px,#27272a_1px,transparent_0)] [background-size:16px_16px]" />
      </div>

      {/* Header */}
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
            beta access
          </span>
          <span className="hidden md:inline">
            Нужна помощь? Напиши в{" "}
            <span className="text-neutral-100">поддержку</span>
          </span>
        </div>
      </header>

      {/* Body */}
      <div className="relative z-10 flex items-center justify-center px-4 sm:px-6 lg:px-10 py-10">
        <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-10 lg:gap-14 items-center">
          {/* Left */}
          <section className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950/60 px-3 py-1 text-[11px] text-neutral-400 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Считаем качество звонков в реальном времени</span>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold leading-tight">
                Войди в{" "}
                <span className="bg-gradient-to-r from-emerald-400 to-lime-300 bg-clip-text text-transparent">
                  CallX
                </span>{" "}
                и смотри на отдел продаж цифрами, а не ощущениями.
              </h1>
              <p className="text-sm sm:text-base text-neutral-400 max-w-xl">
                Загрузи звонки из amoCRM, получи честные оценки менеджеров,
                отчёты по отделу и пойми, где ты реально теряешь деньги.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-neutral-300">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-3 backdrop-blur">
                <p className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
                  анализ
                </p>
                <p className="font-semibold">1000+ звонков</p>
                <p className="text-[11px] text-neutral-500">
                  за пару минут, без ручного прослушивания.
                </p>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-3 backdrop-blur">
                <p className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
                  менеджеры
                </p>
                <p className="font-semibold">прозрачные оценки</p>
                <p className="text-[11px] text-neutral-500">
                  видно, кто продаёт, а кто просто «берёт трубку».
                </p>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-3 backdrop-blur sm:col-span-1 col-span-2">
                <p className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
                  отчёты
                </p>
                <p className="font-semibold">готовый Excel + дашборд</p>
                <p className="text-[11px] text-neutral-500">
                  всё по менеджерам, лидам и сделкам — уже посчитано.
                </p>
              </div>
            </div>

            <p className="text-[11px] text-neutral-500">
              Уже зарегистрирован? Просто войди — твои данные и отчёты уже в системе.
            </p>
          </section>

          {/* Right */}
          <section>
            <div className="relative">
              <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-br from-emerald-500/50 via-lime-300/40 to-sky-500/40 opacity-60 blur-[3px]" />
              <div className="relative rounded-3xl border border-neutral-800/90 bg-neutral-950/90 px-6 sm:px-7 py-6 sm:py-7 shadow-[0_18px_60px_rgba(0,0,0,0.85)] backdrop-blur-xl">
                <div className="mb-5">
                  <h2 className="text-lg sm:text-xl font-semibold">
                    Вход в{" "}
                    <span className="text-emerald-400">
                      CallX<span className="text-neutral-50"> AI</span>
                    </span>
                  </h2>
                  <p className="text-xs text-neutral-500 mt-1.5">
                    Используй почту и пароль, которые указал при регистрации.
                  </p>
                </div>

                {errorText && (
                  <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                      <span className="font-medium">Ошибка авторизации</span>
                    </div>
                    <p className="mt-1.5 leading-snug">{errorText}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-3.5">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-neutral-400">Email</label>
                    <Input
                      type="email"
                      value={email}
                      placeholder="you@company.com"
                      onChange={(ev: React.ChangeEvent<HTMLInputElement>) =>
                        setEmail(ev.target.value)
                      }
                      className="bg-black/40 border-neutral-800 text-sm"
                      required
                      autoComplete="email"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-neutral-400">Пароль</label>
                    <Input
                      type="password"
                      value={password}
                      placeholder="••••••••"
                      onChange={(ev: React.ChangeEvent<HTMLInputElement>) =>
                        setPassword(ev.target.value)
                      }
                      className="bg-black/40 border-neutral-800 text-sm"
                      required
                      autoComplete="current-password"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="text-[11px] text-neutral-500 hover:text-neutral-300 underline underline-offset-2"
                      >
                        Забыли пароль?
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full mt-2 text-sm font-semibold tracking-wide disabled:opacity-70"
                    disabled={!canSubmit}
                  >
                    {loading ? "Входим в аккаунт..." : "Войти в CallX"}
                  </Button>

                  <p className="pt-2 text-[10px] leading-relaxed text-neutral-500">
                    Нажимая «Войти», ты соглашаешься с{" "}
                    <Link
                      href="/terms"
                      className="text-neutral-200 hover:text-white underline underline-offset-2"
                    >
                      Условиями использования
                    </Link>{" "}
                    и{" "}
                    <Link
                      href="/privacy"
                      className="text-neutral-200 hover:text-white underline underline-offset-2"
                    >
                      Политикой конфиденциальности
                    </Link>
                    .
                  </p>
                </form>

                <div className="mt-5 flex flex-col gap-2 text-[11px] text-neutral-500">
                  <div>
                    Нет аккаунта?{" "}
                    <Link
                      href="/auth/register"
                      className="text-neutral-100 hover:text-white underline underline-offset-2"
                    >
                      Зарегистрироваться
                    </Link>
                  </div>
                  <p className="text-[10px] text-neutral-600">
                    Входя в систему, ты подтверждаешь, что не боишься честной статистики по своим продажам.
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
