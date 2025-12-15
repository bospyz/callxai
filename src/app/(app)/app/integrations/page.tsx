import Shell from "@/components/layout/Shell";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { IntegrationType, SubscriptionStatus } from "@prisma/client";
import { IntegrationsClient } from "@/components/app/IntegrationsClient";
import { mapIntegrationToUi } from "@/lib/integration-ui";

type PlanKey = "free" | "start" | "pro" | "enterprise";

function normalizePlan(raw?: string | null): PlanKey {
  const v = (raw ?? "FREE").toLowerCase();
  if (v === "start") return "start";
  if (v === "pro") return "pro";
  if (v === "enterprise" || v === "ent") return "enterprise";
  return "free";
}

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
      where: { companyId, status: SubscriptionStatus.ACTIVE },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const find = (type: IntegrationType) =>
    integrations.find((i) => i.type === type) ?? null;

  // Prisma -> UI
  const amo = mapIntegrationToUi(find(IntegrationType.AMOCRM));
  const bitrix = mapIntegrationToUi(find(IntegrationType.BITRIX24));
  const webhook = mapIntegrationToUi(find(IntegrationType.WEBHOOK));
const plan = normalizePlan(activeSub?.plan);
void plan; // чтобы TS не падал на noUnusedLocals

  // ... твоя логика лимитов (оставь как есть)

  return (
    <Shell>
      <div className="px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* ...шапка/лимиты... */}
        <IntegrationsClient amo={amo} bitrix={bitrix} webhook={webhook} />
      </div>
    </Shell>
  );
}
