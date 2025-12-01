import Link from "next/link";

type Plan = {
  id: string;
  name: string;
  price: string;
  period: string;
  badge?: string;
  description: string;
  recommended?: boolean;
  features: string[];
};

const plans: Plan[] = [
  {
    id: "start",
    name: "START",
    price: "49 990 ",
    period: "в месяц",
    description:
      "Для небольших отделов продаж, которые хотят наконец-то видеть, как реально общаются менеджеры.",
    features: [
      "До 5 менеджеров",
      "До 1 000 звонков в месяц",
      "AI-анализ: приветствие, потребность, закрытие",
      "Базовая аналитика по менеджерам",
      "Экспорт отчётов в Excel",
    ],
  },
  {
    id: "pro",
    name: "PRO",
    price: "129 000 ",
    period: "в месяц",
    badge: "-99 000  скидка на запуск",
    description:
      "Для активных отделов продаж, где важно видеть слабые места в скриптах и прокачивать команду каждую неделю.",
    recommended: true,
    features: [
      "До 20 менеджеров",
      "До 5 000 звонков в месяц",
      "Расширенный AI-анализ (возражения, скрипты, токсичность)",
      "Детальная аналитика по менеджерам и воронке",
      "Приоритетная поддержка в WhatsApp/Telegram",
    ],
  },
  {
    id: "enterprise",
    name: "ENTERPRISE",
    price: "от 899 000 ",
    period: "в месяц",
    description:
      "Для крупных застройщиков, банков и колл-центров. Делаем кастом: отчёты, интеграции, безопасность под ваши регламенты.",
    features: [
      "От 50 менеджеров",
      "Кастомные лимиты по звонкам",
      "Отдельный аккаунт-менеджер",
      "Кастомные отчёты и дашборды",
      "Интеграции под ваш стек",
    ],
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      <div className="px-5 sm:px-8 lg:px-10 pt-10 pb-6 border-b border-neutral-900/80 bg-gradient-to-b from-black via-black to-neutral-950">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-neutral-500">
            <span className="h-1 w-5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
            <span>тарифы для рынка Казахстана</span>
          </div>
          <div className="space-y-3">
            <h1 className="text-2xl sm:text-3xl font-semibold text-neutral-50">
              CALLX считает звонки, ты считаешь деньги
            </h1>
            <p className="text-sm sm:text-base text-neutral-400 max-w-2xl">
              Все цены в тенге, без мелкого шрифта. Начни со старта, а когда команда
              вырастет  спокойно перейдёшь на PRO или ENTERPRISE.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-5 sm:px-8 lg:px-10 py-8 bg-gradient-to-b from-neutral-950 via-black to-black">
        <div className="max-w-5xl mx-auto grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <PricingCard key={plan.id} plan={plan} />
          ))}
        </div>

        <div className="max-w-3xl mx-auto mt-10 text-center text-[13px] text-neutral-500">
          <p>
            Для ENTERPRISE мы обычно делаем пилот на 24 недели: подключаем отдел
            продаж, накапливаем звонки и показываем, как именно падают или растут
            конверсии.
          </p>
        </div>
      </div>
    </main>
  );
}

function PricingCard({ plan }: { plan: Plan }) {
  const isPro = plan.id === "pro";

  return (
    <div
      className={[
        "relative flex flex-col rounded-2xl border bg-neutral-950/70 p-4 sm:p-5 shadow-[0_0_40px_rgba(15,23,42,0.85)]",
        isPro
          ? "border-emerald-500/60 bg-gradient-to-b from-emerald-500/10 via-neutral-950 to-neutral-950"
          : "border-neutral-800",
      ].join(" ")}
    >
      {plan.recommended && (
        <div className="absolute -top-3 right-4 rounded-full border border-emerald-400/70 bg-emerald-500/20 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-200">
          рекомендуем
        </div>
      )}

      <div className="mb-4 space-y-2">
        <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
          тариф
        </div>
        <div className="flex items-baseline gap-2">
          <h2 className="text-xl font-semibold text-neutral-50">{plan.name}</h2>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-semibold text-emerald-400">
            {plan.price}
          </span>
          <span className="text-[12px] text-neutral-500">/ {plan.period}</span>
        </div>
        {plan.badge && (
          <div className="inline-flex items-center rounded-full border border-amber-400/60 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-200">
            {plan.badge}
          </div>
        )}
        <p className="text-[13px] text-neutral-300 mt-2">{plan.description}</p>
      </div>

      <ul className="flex-1 space-y-1.5 text-[13px] text-neutral-200 mb-4">
        {plan.features.map((feature, idx) => (
          <li key={idx} className="flex gap-2">
            <span className="mt-1 h-1 w-3 rounded-full bg-emerald-400/80" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-3 border-t border-neutral-800 flex flex-col gap-2">
        {plan.id === "enterprise" ? (
          <>
            <Link
              href="/app/billing"
              className="inline-flex items-center justify-center rounded-xl border border-neutral-700 text-[13px] text-neutral-100 px-3.5 py-2 hover:border-emerald-400 hover:text-white transition-all"
            >
              Оставить заявку на ENTERPRISE
            </Link>
            <p className="text-[11px] text-neutral-500">
              Обсудим объём звонков, интеграции и безопасность под ваш комитет.
            </p>
          </>
        ) : (
          <>
            <Link
              href="/auth/register"
              className={[
                "inline-flex items-center justify-center rounded-xl text-[13px] px-3.5 py-2 font-medium transition-all",
                plan.id === "pro"
                  ? "bg-emerald-500 text-black hover:bg-emerald-400"
                  : "border border-neutral-700 text-neutral-100 hover:border-emerald-400 hover:text-white",
              ].join(" ")}
            >
              Начать на {plan.name}
            </Link>
            <p className="text-[11px] text-neutral-500">
              Оплата в тенге, счёт для юрлица по запросу.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
