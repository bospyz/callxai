// src/app/(app)/app/integrations/page.tsx

import Shell from "@/components/layout/Shell";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { IntegrationType, SubscriptionStatus } from "@prisma/client";
import { IntegrationsClient } from "@/components/app/IntegrationsClient";

export default async function Page() {
  const session = await auth();
  const user = session?.user as any;
  const companyId = user?.companyId as string | undefined;

  if (!companyId) {
    return (
      <Shell>
        <div className="p-6">
          <h1 className="text-xl font-semibold text-neutral-50">
            Нет компании в сессии
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Перелогинься или заново создай аккаунт компании.
          </p>
        </div>
      </Shell>
    );
  }

  const [integrations, activeSub] = await Promise.all([
    db.integration.findMany({
      where: { companyId },
      orderBy: { createdAt: "asc" },
    }),
    db.subscription.findFirst({
      where: {
        companyId,
        status: SubscriptionStatus.ACTIVE,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const find = (type: IntegrationType) =>
    integrations.find((i) => i.type === type) ?? null;

  const amo = find(IntegrationType.AMOCRM);
  const bitrix = find(IntegrationType.BITRIX24);
  const webhook = find(IntegrationType.WEBHOOK);

  const plan = (activeSub?.plan ?? "FREE").toLowerCase();

  let planLabel = "FREE · 30 бесплатных звонков ≥ 30 сек";
  let planHint =
    "После 30 боевых звонков (длительность ≥ 30 секунд) нужно будет подключить платный тариф.";

  if (plan === "start") {
    planLabel = "START · до 2 000 звонков ≥ 30 сек в месяц";
    planHint =
      "Лимит считается только по звонкам длительностью от 30 секунд и выше.";
  } else if (plan === "enterprise") {
    planLabel = "ENTERPRISE · без ограничений по звонкам ≥ 30 сек";
    planHint =
      "Можно спокойно тянуть все боевые звонки из amoCRM / Bitrix24 без лимитов.";
  }

  return (
    <Shell>
      <div className="px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Шапка + инфо по лимитам */}
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">
            Интеграции
          </h1>
          <p className="text-sm text-neutral-400 max-w-2xl">
            Подключи amoCRM / Bitrix24 и начни тянуть звонки в CallX. Мы считаем
            только боевые разговоры — звонки длительностью от 30 секунд.
          </p>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/90 px-4 py-3 text-xs text-neutral-300">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] uppercase text-neutral-500">
                  Текущий режим
                </p>
                <p className="text-sm font-medium text-neutral-50">
                  {planLabel}
                </p>
              </div>
              <p className="text-[11px] text-neutral-400 sm:text-right mt-2 sm:mt-0">
                {planHint}
              </p>
            </div>
          </div>
        </div>

        {/* Сам клиент интеграций */}
        <IntegrationsClient amo={amo} bitrix={bitrix} webhook={webhook} />
      </div>
    </Shell>
  );
}
