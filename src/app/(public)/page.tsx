"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import LandingHeader from "./LandingHeader";
import CookieBanner from "@/components/layout/CookieBanner";
import { useEffect, useState } from "react";

const HOOKS = [
  "AI слушает каждый звонок вместо руководителя.",
  "Узнай, где менеджеры реально теряют деньги на звонках.",
  "Сотни часов прослушки заменяет один дашборд CallXAI.",
  "Вся воронка продаж в звонках — в одной панели.",
];

export default function Landing() {
  const year = new Date().getFullYear();
  const [hookIndex, setHookIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setHookIndex((prev) => (prev + 1) % HOOKS.length),
      3500
    );
    return () => clearInterval(id);
  }, []);

  const handleLearnMore = () => {
    const el = document.getElementById("how");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="relative min-h-screen bg-[#05000D] text-white overflow-hidden">
      {/* Глобальный фон (градиенты + сетка) */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-24 h-80 w-80 bg-[radial-gradient(circle_at_center,#f97316,transparent_70%)] opacity-70 blur-3xl" />
        <div className="absolute -top-36 right-[-80px] h-80 w-80 bg-[radial-gradient(circle_at_center,#a855f7,transparent_70%)] opacity-90 blur-3xl" />
        <div className="absolute bottom-[-140px] left-1/2 -translate-x-1/2 h-[22rem] w-[40rem] bg-[radial-gradient(circle_at_center,#22c55e,transparent_70%)] opacity-40 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#020617_0,#05000D_55%,#000_100%)] opacity-90" />
        <div className="absolute inset-0 opacity-[0.18] mix-blend-soft-light">
          <div className="h-full w-full bg-[linear-gradient(to_right,#111827_1px,transparent_1px),linear-gradient(to_bottom,#111827_1px,transparent_1px)] bg-[size:70px_70px]" />
        </div>
      </div>

      {/* Хэдер + куки */}
      <LandingHeader />
      <CookieBanner />

      {/* Контент (отступ под фикс-хэдер) */}
      <div className="pt-28 sm:pt-32 md:pt-36">
        {/* ===== HERO с full-width видео ===== */}
        <section
          id="home"
          className="relative scroll-mt-32 w-full pt-4 sm:pt-6 pb-14 sm:pb-16 lg:pb-20"
        >
          {/* Видео-фон на всю ширину с градиентами сверху и снизу */}
          <div className="absolute inset-0 z-0 overflow-hidden">
            <video
              className="w-full h-full object-cover"
              autoPlay
              muted
              loop
              playsInline
            >
              <source src="/hero.mp4?v=2" type="video/mp4" />
            </video>

            {/* верхний градиент */}
            <div className="absolute top-0 inset-x-0 h-[45%] bg-gradient-to-b from-black/85 via-black/50 to-transparent pointer-events-none" />
            {/* нижний градиент */}
            <div className="absolute bottom-0 inset-x-0 h-[55%] bg-gradient-to-t from-[#05000D] via-black/70 to-transparent pointer-events-none" />
          </div>

          {/* Внутренний контейнер */}
          <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center text-center min-h-[520px]">
              {/* Бейдж */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/40 border border-white/20 text-[10px] sm:text-[11px] uppercase tracking-[0.24em] text-neutral-200/90 mb-4">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(34,197,94,0.95)]" />
                AI Call Analytics
              </div>

              {/* Заголовок */}
              <h1 className="font-extrabold leading-tight text-[clamp(2.2rem,4.6vw,3.8rem)] md:text-[clamp(2.8rem,4.4vw,4.2rem)] max-w-3xl">
                Smart Call Analytics{" "}
                <span className="bg-gradient-to-r from-[#f97316] via-[#f97316] to-[#e5e7eb] bg-clip-text text-transparent">
                  Effortless Control
                </span>
              </h1>

              {/* Живой хук */}
              <p className="mt-3 text-[13px] sm:text-sm md:text-base max-w-xl text-neutral-100/90 transition-opacity duration-500">
                {HOOKS[hookIndex]}
              </p>

              {/* CTA */}
              <div className="mt-7 mb-5 flex flex-wrap justify-center gap-3 sm:gap-4">
                <Link href="/auth/register">
                  <Button className="relative rounded-full px-8 sm:px-10 py-2.5 sm:py-3 text-sm sm:text-base font-semibold bg-gradient-to-r from-[#f97316] via-[#ec4899] to-[#6366f1] shadow-[0_0_35px_rgba(244,114,182,0.8)] hover:brightness-110 transition-transform hover:-translate-y-[1px] active:translate-y-[0px]">
                    Подключить CallXAI
                  </Button>
                </Link>
                <button
                  onClick={handleLearnMore}
                  className="rounded-full px-7 py-2.5 text-sm sm:text-base border border-white/40 bg-black/40 text-neutral-50 hover:bg-white/10 hover:border-white/60 transition-colors"
                >
                  Узнать больше
                </button>
              </div>

              {/* Мини-статы */}
              <div className="flex flex-wrap justify-center gap-4 sm:gap-6 text-[10px] sm:text-xs text-neutral-300/90 mb-4 sm:mb-5">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>+27% к конверсии из звонка в сделку</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                  <span>Сотни часов прослушки заменены AI</span>
                </div>
              </div>

              {/* Логотипы интеграций */}
              <div className="mt-1 text-[10px] sm:text-[11px] uppercase tracking-[0.22em] text-neutral-400">
                Integrates with
              </div>
              <div className="mt-1 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs sm:text-[13px] text-neutral-300/80">
                <span>AmoCRM</span>
                <span>Bitrix24</span>
                <span>Ringostat</span>
                <span>CoMagic</span>
                <span>Mango Office</span>
              </div>

              {/* Две карточки под Hero */}
              <div className="relative mt-10 sm:mt-12 lg:mt-14 grid gap-5 sm:gap-6 md:grid-cols-2 w-full">
                {/* Левая карточка */}
                <div className="relative rounded-[26px] bg-gradient-to-b from-[#1f0430]/95 via-[#190319] to-[#050009] border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.9)] p-4 sm:p-5 flex flex-col gap-3 overflow-hidden">
                  <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 h-20 w-[70%] bg-[radial-gradient(circle_at_center,rgba(248,250,252,0.22),transparent)] opacity-70" />
                  <div className="flex items-center justify-between gap-2 text-xs sm:text-sm relative">
                    <span className="text-neutral-200/90">У вас 3 новых звонка</span>
                    <div className="h-7 w-7 rounded-full bg-black/60 border border-white/15 flex items-center justify-center">
                      <span className="h-2 w-2 rounded-full bg-[#f97316] shadow-[0_0_10px_rgba(249,115,22,0.95)]" />
                    </div>
                  </div>
                  <div className="mt-1 rounded-[22px] bg-gradient-to-r from-[#4c0519] via-[#7c2d12] to-[#1f2937] p-[1px] relative">
                    <div className="rounded-[20px] bg-black/80 px-3.5 py-3 flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-amber-300 to-orange-500 flex-shrink-0 flex items-center justify-center text-xs font-semibold">
                        А
                      </div>
                      <div className="flex-1 text-left">
                        <div className="text-xs sm:text-sm font-medium">
                          Айгерим • Лид по ЖК
                        </div>
                        <div className="text-[10px] sm:text-[11px] text-neutral-300/85">
                          Перезвон по заявке с лендинга • через 10 мин
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-3">
                    <button className="flex-1 min-w-[120px] rounded-full border border-white/22 bg-white/5 text-xs sm:text-sm py-2 hover:bg-white/10 transition-colors">
                      Подготовить скрипт
                    </button>
                    <button className="flex-1 min-w-[120px] rounded-full bg-gradient-to-r from-[#f97316] to-[#fb923c] text-xs sm:text-sm py-2 font-semibold shadow-[0_0_25px_rgba(249,115,22,0.9)] hover:brightness-110 transition-transform hover:-translate-y-[1px]">
                      Начать звонок
                    </button>
                  </div>
                  <div className="mt-3 text-[11px] sm:text-xs text-neutral-400 relative">
                    CallXAI автоматически запишет, расшифрует и оценит этот звонок по
                    скрипту.
                  </div>
                </div>

                {/* Правая карточка */}
                <div className="relative rounded-[26px] bg-gradient-to-b from-[#020617]/95 via-[#020617] to-[#020014] border border-white/10 shadow-[0_24px_60px_rgba(15,23,42,0.95)] p-4 sm:p-5 flex flex-col gap-4 overflow-hidden">
                  <div className="pointer-events-none absolute -right-24 top-[-40px] h-44 w-44 rounded-full bg-[radial-gradient(circle_at_center,rgba(129,140,248,0.4),transparent)]" />
                  <div className="flex items-center justify-between text-xs sm:text-sm relative">
                    <span className="text-neutral-200/90">Сессия анализа</span>
                    <span className="text-[10px] text-neutral-400">
                      Обновлено 3 сек назад
                    </span>
                  </div>
                  <div className="rounded-[20px] bg-black/60 border border-purple-400/50 p-3 flex items-center gap-3 relative">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-purple-400 via-fuchsia-500 to-indigo-500 flex-shrink-0 flex items-center justify-center text-[11px] font-semibold shadow-[0_0_16px_rgba(168,85,247,0.85)]">
                      AI
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-xs sm:text-sm font-medium">
                        Анализ скрипта отдела продаж
                      </div>
                      <div className="text-[10px] sm:text-[11px] text-neutral-300/90">
                        128 звонков • 23 проблемных диалога
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2 text-[11px] sm:text-xs relative">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-300">Скрипт соблюдён</span>
                      <span className="text-emerald-400 font-semibold">86%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full w-[86%] rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-purple-500" />
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-neutral-300">
                        Потерянные лиды после звонка
                      </span>
                      <span className="text-amber-300 font-semibold">−24%</span>
                    </div>
                  </div>
                  <div className="mt-3 rounded-[18px] bg-gradient-to-r from-purple-500/30 via-fuchsia-500/30 to-emerald-400/30 border border-white/15 px-3.5 py-3 text-[11px] sm:text-xs text-neutral-50 relative">
                    CallXAI показывает менеджеров, которые теряют деньги компании, и
                    те моменты разговора, где ломается сделка.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== HOW IT WORKS ===== */}
        <section
          id="how"
          className="scroll-mt-28 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 sm:pb-18 lg:pb-20"
        >
          <div className="text-center mb-8 sm:mb-10">
            <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300/90">
              Процесс
            </p>
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-semibold mt-2">
              Как работает CallXAI от подключения до отчётов
            </h2>
            <p className="text-sm md:text-base text-neutral-300 max-w-2xl mx-auto mt-3">
              Вы даёте доступ к CRM и телефонии — мы настраиваем поток звонков и уже
              через несколько часов вы видите живую картинку по отделу продаж.
            </p>
          </div>

          <div className="grid gap-5 sm:gap-6 md:grid-cols-4">
            {[
              "Подключаем AmoCRM / Bitrix24 и телефонию. Никакого кода, просто доступ к интеграции.",
              "AI расшифровывает каждый звонок и отмечает этапы: приветствие, потребность, оффер, возражения, закрытие.",
              "Система оценивает выполнение скрипта, силу менеджера и работу с возражениями.",
              "Вы видите дашборд: конверсию, рейтинг менеджеров, потерянные лиды и конкретные проблемные звонки.",
            ].map((step, i) => (
              <div
                key={i}
                className="relative rounded-3xl bg-white/[0.04] border border-white/10 backdrop-blur-xl p-4 sm:p-5 flex flex-col gap-3 min-h-[160px] shadow-[0_18px_40px_rgба(0,0,0,0.7)]"
              >
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-emerald-400 to-sky-500 flex items-center justify-center text-xs font-semibold shadow-[0_0_18px_rgba(59,130,246,0.7)]">
                  {i + 1}
                </div>
                <p className="text-[13px] sm:text-sm text-neutral-200">{step}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ===== USE CASES ===== */}
        <section
          id="cases"
          className="scroll-mt-28 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 sm:pb-18 lg:pb-20"
        >
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8 sm:mb-10">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-violet-300/90">
                Use cases
              </p>
              <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-semibold mt-2">
                Где CallXAI даёт максимальный буст
              </h2>
            </div>
            <p className="text-sm md:text-base text-neutral-300 max-w-md">
              Любой бизнес, где есть поток заявок через звонки. Система анализирует
              100% диалогов, а не выборочно.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                industry: "Застройщики и апарт-отели",
                text: "Видно, где менеджеры теряют клиента на пути от лида до брони. Часто даёт +25–30% к сделкам без роста рекламы.",
              },
              {
                industry: "Автосалоны и дилеры",
                text: "Контроль каждой входящей заявки, дисциплина скриптов, меньше «не дозвонились» и потерянных номеров.",
              },
              {
                industry: "Онлайн-школы и курсы",
                text: "Понимаете, кто реально закрывает на оплату, а кто просто болтает. Можно масштабировать сильные скрипты.",
              },
            ].map((usecase) => (
              <div
                key={usecase.industry}
                className="rounded-3xl border border-white/12 bg-gradient-to-br from-white/[0.04] via-slate-900/70 to-violet-900/50 backdrop-blur-xl p-6 flex flex-col gap-2 shadow-[0_20px_45px_rgба(0,0,0,0.7)]"
              >
                <h3 className="text-lg font-semibold">{usecase.industry}</h3>
                <p className="text-sm text-neutral-200/90">{usecase.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ===== PRICING ===== */}
        <section
          id="pricing"
          className="scroll-mt-28 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 sm:pb-22 lg:pb-24"
        >
          <div className="text-center mb-8 sm:mb-10">
            <p className="text-[11px] uppercase tracking-[0.2ем] text-emerald-300/90">
              Тарифы
            </p>
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-semibold mt-2">
              Начните бесплатно и масштабируйтесь по мере роста
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                title: "Free",
                price: "0 ₸ / мес",
                sub: "Для теста и первых 30 звонков",
                features: [
                  "до 30 звонков в месяц",
                  "AI-расшифровка звонков",
                  "простые отчёты по отделу",
                ],
                highlight: false,
              },
              {
                title: "Start",
                price: "49 990 ₸ / мес",
                sub: "Небольшой отдел продаж, стабильный поток лидов",
                features: [
                  "до 2 000 звонков в месяц",
                  "скоринг по скриптам и KPI",
                  "дашборд руководителя",
                  "поиск проблемных звонков",
                ],
                highlight: true,
              },
              {
                title: "Enterprise",
                price: "по запросу",
                sub: "Сети, холдинги, крупные колл-центры",
                features: [
                  "10 000+ звонков в месяц",
                  "экспорт в BI-системы",
                  "кастомные отчёты и метрики",
                  "выделенный аккаунт-менеджер",
                ],
                highlight: false,
              },
            ].map((plan) => (
              <div
                key={plan.title}
                className={`relative rounded-3xl p-[1px] ${
                  plan.highlight
                    ? "bg-gradient-to-br from-emerald-400 via-sky-400 to-violet-500 shadow-[0_0_45px_rgба(59,130,246,0.7)]"
                    : "bg-white/10 shadow-[0_16px_38px_rgба(0,0,0,0.7)]"
                }`}
              >
                <div className="rounded-[22px] bg-black/80 backdrop-blur-2xl p-6 flex flex-col gap-4 h-full">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-neutral-400">{plan.title}</p>
                      <p className="text-xl font-semibold mt-1">{plan.price}</p>
                    </div>
                    {plan.highlight && (
                      <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 text-emerald-300 border border-emerald-400/60">
                        Лучший выбор
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-300">{plan.sub}</p>
                  <ul className="mt-1 text-sm text-neutral-200 space-y-1.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-emerald-400/90" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-3">
                    <Link href="/auth/register">
                      <Button className="w-full h-10 text-sm font-medium rounded-full bg-white/5 text-white hover:bg-white/10">
                        Подключить CallXAI
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="w-full border-т border-white/10 bg-black/40">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14 lg:py-16 text-center">
            <h3 className="text-[clamp(1.4rem,2.6vw,2rem)] font-semibold mb-3 sm:mb-4">
              Хотите видеть настоящую картину по отделу продаж?
            </h3>
            <p className="text-sm md:text-base text-neutral-300 max-w-2xl mx-auto mb-6 sm:mb-7">
              Подключаем вашу CRM и телефонию, включаем AI-аналитику и уже через
              несколько часов вы смотрите на живой дашборд: конверсия, менеджеры,
              потерянные деньги.
            </p>
            <Link href="/auth/register">
              <Button className="h-11 px-8 text-sm sm:text-base rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-violet-500 text-black font-medium hover:brightness-110 shadow-[0_0_35px_rgба(56,189,248,0.7)]">
                Подключить CallXAI сейчас
              </Button>
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-т border-white/10 bg-black/80">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-neutral-400">
            <span>© {year} CallXAI. Все права защищены.</span>
            <div className="flex gap-4">
              <Link href="/privacy" className="hover:text-white transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-white transition-colors">
                Terms
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
