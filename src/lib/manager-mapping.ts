import { db } from "@/lib/db";

/**
 * Ищет менеджера по amoUserId внутри компании.
 * Возвращает manager.id или null, если не найден.
 */
export async function resolveManagerIdForAmoUser(
  companyId: string,
  amoUserId: number | string | null | undefined
): Promise<string | null> {
  if (!companyId || amoUserId == null) return null;

  const manager = await db.manager.findFirst({
    where: {
      companyId,
      amoUserId: String(amoUserId),
    },
    select: { id: true },
  });

  return manager?.id ?? null;
}
