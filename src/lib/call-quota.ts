// src/lib/call-quota.ts

import { db } from "./db";
import { SubscriptionStatus } from "@prisma/client";

export type PlanKey = "free" | "start" | "pro" | "enterprise";

export type CallsQuota = {
  plan: PlanKey;
  limit: number | null;       // null = безлимит
  used: number;               // сколько "боевых" звонков (>= billableMin) уже есть в периоде
  remaining: number | null;   // сколько ещё можно
  billableMinDurationSec: number; // минимальная длительность, которую считаем по квоте
};

export function normalizePlan(raw?: string | null): PlanKey {
  if (!raw) return "free";
  const v = raw.toLowerCase().trim();

  if (v.includes("enterprise") || v === "ent") return "enterprise";
  if (v.includes("pro")) return "pro";
  if (v.includes("start") || v.includes("basic")) return "start";

  return "free";
}

/**
 * Fallback-лимиты (если в БД нет callsLimitPerMonth).
 * Ты просил: START = 2000.
 */
export function getLimitForPlan(plan: PlanKey): number | null {
  switch (plan) {
    case "free":
      return 30;
    case "start":
      return 2000;
    case "pro":
      return 10000; // поставь как хочешь
    case "enterprise":
      return null;
    default:
      return 30;
  }
}

/**
 * Минимальная длительность "боевого" звонка для списания квоты.
 * Можно сделать разной по тарифу — пока фикс 30 сек.
 */
export function getBillableMinDurationSec(_plan: PlanKey): number {
  return 30;
}

function getCurrentPeriodBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

async function countCompanyCallsForCurrentMonth(
  companyId: string,
  billableMinDurationSec: number
): Promise<number> {
  const { start, end } = getCurrentPeriodBounds();

  return db.call.count({
    where: {
      companyId,
      createdAt: { gte: start, lt: end },
      duration: { gte: billableMinDurationSec },
    },
  });
}

export async function getCallsQuota(companyId: string): Promise<CallsQuota> {
  const sub = await db.subscription.findFirst({
    where: { companyId, status: SubscriptionStatus.ACTIVE },
    orderBy: { createdAt: "desc" },
  });

  const plan = normalizePlan(sub?.plan);
  const billableMinDurationSec = getBillableMinDurationSec(plan);

  // ENTERPRISE — безлимит
  if (plan === "enterprise") {
    return {
      plan,
      limit: null,
      used: 0,
      remaining: null,
      billableMinDurationSec,
    };
  }

  // Лимит: сначала из БД (callsLimitPerMonth), иначе fallback по плану
  const limitFromDb =
    typeof (sub as any)?.callsLimitPerMonth === "number"
      ? (sub as any).callsLimitPerMonth
      : null;

  const limit = limitFromDb ?? getLimitForPlan(plan);

  if (limit === null) {
    return {
      plan,
      limit: null,
      used: 0,
      remaining: null,
      billableMinDurationSec,
    };
  }

  const used = await countCompanyCallsForCurrentMonth(companyId, billableMinDurationSec);
  const remaining = Math.max(limit - used, 0);

  return {
    plan,
    limit,
    used,
    remaining,
    billableMinDurationSec,
  };
}

export async function getRemainingCallsQuota(companyId: string): Promise<CallsQuota> {
  return getCallsQuota(companyId);
}

export async function getQuotaForImport(
  companyId: string,
  requested: number
): Promise<{ allowed: number; quota: CallsQuota }> {
  const quota = await getCallsQuota(companyId);

  if (quota.limit === null) {
    return { allowed: requested, quota };
  }

  const remaining = Math.max(quota.remaining ?? 0, 0);
  const allowed = Math.max(Math.min(requested, remaining), 0);

  return { allowed, quota: { ...quota, remaining } };
}

export async function canCompanyIngestCall(companyId: string): Promise<{
  allowed: boolean;
  limit: number | null;
  remaining: number | null;
  plan: PlanKey;
  reason: "unlimited" | "limit-reached" | "within-limit";
}> {
  const quota = await getCallsQuota(companyId);

  if (quota.limit === null) {
    return { allowed: true, limit: null, remaining: null, plan: quota.plan, reason: "unlimited" };
  }

  const remaining = quota.remaining ?? 0;

  if (remaining <= 0) {
    return { allowed: false, limit: quota.limit, remaining: 0, plan: quota.plan, reason: "limit-reached" };
  }

  return { allowed: true, limit: quota.limit, remaining, plan: quota.plan, reason: "within-limit" };
}
