"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const nextStep = () => {
    setStep((prev) => (prev === 3 ? 3 : ((prev + 1) as 1 | 2 | 3)));
  };

  const prevStep = () => {
    setStep((prev) => (prev === 1 ? 1 : ((prev - 1) as 1 | 2 | 3)));
  };

  const finish = () => {
    setLoading(true);
    // TODO: можно дернуть API для сохранения статуса онбординга
    // пока просто отправляем в /app
    router.push("/app");
  };

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center px-4">
      <div className="w-full max-w-3xl pt-10 pb-16">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">
              CALLX SETUP
            </p>
            <h1 className="mt-2 text-2xl font-semibold">
              Первичная настройка аккаунта
            </h1>
            <p className="mt-1 text-sm text-neutral-400">
              Три шага, чтобы платформа начала автоматически анализировать твои звонки.
            </p>
          </div>
          <Link
            href="/app"
            className="text-xs text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
          >
            Пропустить и перейти в дэшборд
          </Link>
        </header>

        {/* Индикатор шагов */}
        <div className="mb-8 flex items-center gap-3 text-xs">
          {[1, 2, 3].map((s) => {
            const active = s === step;
            const done = s < step;
            return (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={[
                    "h-7 w-7 rounded-full flex items-center justify-center border text-[11px]",
                    done
                      ? "bg-emerald-500/20 border-emerald-400 text-emerald-200"
                      : active
                      ? "bg-white text-black border-white"
                      : "border-neutral-700 text-neutral-400",
                  ].join(" ")}
                >
                  {s}
                </div>
                <span className="text-neutral-400">
                  {s === 1 && "Компания"}
                  {s === 2 && "Интеграция amoCRM"}
                  {s === 3 && "Менеджеры"}
                </span>
                {s !== 3 && (
                  <div className="h-px w-6 bg-neutral-800 mx-1" aria-hidden />
                )}
              </div>
            );
          })}
        </div>

        {/* Контент шага */}
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-5 sm:p-6"
        >
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">1. Данные компании</h2>
              <p className="text-sm text-neutral-400">
                Заполни базовые данные компании  они появятся в отчётах и внутри аккаунта.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs text-neutral-400">Название компании</label>
                  <input
                    className="w-full rounded-lg bg-black border border-neutral-800 px-3 py-2 text-sm outline-none focus:border-emerald-500/70"
                    placeholder="Например, TOO Best Sales Group"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-neutral-400">Отрасль</label>
                  <input
                    className="w-full rounded-lg bg-black border border-neutral-800 px-3 py-2 text-sm outline-none focus:border-emerald-500/70"
                    placeholder="Недвижимость, авто, онлайн-школа..."
                  />
                </div>
              </div>

              <p className="text-[11px] text-neutral-500">
                * Эти данные пока никуда не отправляются. Позже можно связать онбординг с API.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">2. Подключение amoCRM</h2>
              <p className="text-sm text-neutral-400">
                Подключи amoCRM, чтобы CallX автоматически подтягивал звонки и лиды.
              </p>

              <ol className="list-decimal list-inside space-y-2 text-sm text-neutral-300">
                <li>Зайди в amoCRM под админ-аккаунтом.</li>
                <li>Перейди в раздел Интеграции и найди CallX.</li>
                <li>Нажми Подключить и выдай доступ к звонкам и лидам.</li>
              </ol>

              <div className="mt-3 rounded-xl border border-neutral-800 bg-black/60 p-4 text-xs text-neutral-400">
                <p className="mb-2 font-medium text-neutral-200">
                  Пока что это демо-блок.
                </p>
                <p>
                  Когда интеграция будет готова, сюда можно вывести кнопку{" "}
                  <span className="text-emerald-400">Подключить amoCRM</span>, которая
                  открывает OAuth-окно и сохраняет токены через API.
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">3. Добавление менеджеров</h2>
              <p className="text-sm text-neutral-400">
                Укажи, кто будет работать в CallX. Это позволит строить отчёты по каждому менеджеру.
              </p>

              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-[2fr,1fr]">
                  <input
                    className="w-full rounded-lg bg-black border border-neutral-800 px-3 py-2 text-sm outline-none focus:border-emerald-500/70"
                    placeholder="Имя менеджера"
                  />
                  <input
                    className="w-full rounded-lg bg-black border border-neutral-800 px-3 py-2 text-sm outline-none focus:border-emerald-500/70"
                    placeholder="Телеграм / внутренний номер"
                  />
                </div>
              </div>

              <p className="text-[11px] text-neutral-500">
                Позже этот шаг можно связать с реальным API: создаёшь менеджера здесь, а мы
                создаём его в БД и подтягиваем звонки из amoCRM.
              </p>
            </div>
          )}
        </motion.div>

        {/* Навигация по шагам */}
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={prevStep}
            disabled={step === 1}
            className="text-xs text-neutral-500 hover:text-neutral-200 disabled:opacity-40 disabled:hover:text-neutral-500"
          >
            Назад
          </button>

          <div className="flex items-center gap-3">
            {step < 3 && (
              <button
                type="button"
                onClick={nextStep}
                className="rounded-full bg-white text-black text-xs px-4 py-2 font-medium hover:bg-neutral-200 transition-colors"
              >
                Далее
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                onClick={finish}
                disabled={loading}
                className="rounded-full bg-emerald-500 text-black text-xs px-4 py-2 font-medium hover:bg-emerald-400 transition-colors disabled:opacity-60"
              >
                {loading ? "Открываем дэшборд..." : "Завершить настройку"}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
