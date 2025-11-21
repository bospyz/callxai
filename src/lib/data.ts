import { db } from "./db";

export async function getDashboardSummary(companyId: string) {
  const [calls, managers] = await Promise.all([
    db.call.count({ where: { companyId } }),
    db.manager.count({ where: { companyId } }),
  ]);

  return { calls, managers };
}
