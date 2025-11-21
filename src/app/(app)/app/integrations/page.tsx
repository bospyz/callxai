import Shell from "@/components/layout/Shell";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { IntegrationType } from "@prisma/client";
import { IntegrationsClient } from "@/components/app/IntegrationsClient";

export default async function IntegrationsPage() {
  const session = await auth();
  const companyId = (session?.user as any)?.companyId as string | undefined;

  if (!companyId) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold">Нет доступа</h1>
      </Shell>
    );
  }

  const integrations = await db.integration.findMany({
    where: { companyId },
  });

  const find = (type: IntegrationType) =>
    integrations.find((i) => i.type === type) || null;

  const amo = find(IntegrationType.AMOCRM);
  const bitrix = find(IntegrationType.BITRIX24);
  const webhook = find(IntegrationType.WEBHOOK);

  return (
    <Shell>
      <h1 className="text-2xl font-bold mb-6">Интеграции</h1>
      <IntegrationsClient amo={amo} bitrix={bitrix} webhook={webhook} />
    </Shell>
  );
}
