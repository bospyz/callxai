// src/lib/call-quota.ts

import { db } from "./db";
import { SubscriptionStatus } from "@prisma/client";

export type PlanKey = "free" | "start" | "pro" | "enterprise";

export type CallsQuota = {
  plan: PlanKey;
  limit: number | null;     // null = безлимит
  used: number;             // сколько звонков (>= 30 сек) уже есть за период
  remaining: number | null; // сколько ещё можно
};

// Нормализуем название плана из subscription.plan
export function normalizePlan(raw?: string | null): PlanKey {
  const v = (raw ?? "FREE").toLowerCase();
  if (v === "start") return "start";
  if (v === "pro") return "pro";
  if (v === "enterprise" || v === "ent") return "enterprise";
  return "free";
}

// Лимит по плану (боевые звонки длительностью >= 30 сек)
export function getLimitForPlan(plan: PlanKey): number | null {
  if (plan === "free") return 30;
  if (plan === "start") return 2000;
  if (plan === "pro") return 5000;
  if (plan === "enterprise") return null; // без лимита
  return 30;
}

// Текущий биллинг-период — календарный месяц
function getCurrentPeriodStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Считает квоту по звонкам для компании:
 * - берёт активную подписку,
 * - считает звонки (duration >= 30) за текущий месяц,
 * - возвращает план / лимит / used / remaining.
 */
export async function getRemainingCallsQuota(
  companyId: string
): Promise<CallsQuota> {
  const sub = await db.subscription.findFirst({
    where: {
      companyId,
      status: SubscriptionStatus.ACTIVE,
    },
    orderBy: { createdAt: "desc" },
  });

  const plan = normalizePlan(sub?.plan);
  const limit = getLimitForPlan(plan);

  if (limit === null) {
    // ENTERPRISE — без ограничений
    return {
      plan,
      limit: null,
      used: 0,
      remaining: null,
    };
  }

  const periodStart = getCurrentPeriodStart();

  // считаем только звонки >= 30 сек
  const used = await db.call.count({
    where: {
      companyId,
      createdAt: { gte: periodStart },
      duration: {
        gte: 30,
      },
    },
  });

  const remaining = Math.max(limit - used, 0);

  return {
    plan,
    limit,
    used,
    remaining,
  };
}

/**
 * Helper для импорта: говорит, сколько ЗАПРОШЕННЫХ звонков
 * реально можно подтянуть с учётом квоты.
 */
export async function getQuotaForImport(
  companyId: string,
  requested: number
): Promise<{ allowed: number; quota: CallsQuota }> {
  const quota = await getRemainingCallsQuota(companyId);

  if (quota.limit === null) {
    // безлимитный план — можно всё, что запросили
    return {
      allowed: requested,
      quota,
    };
  }

  const remaining = Math.max(quota.remaining ?? 0, 0);
  const allowed = Math.max(Math.min(requested, remaining), 0);

  return {
    allowed,
    quota: {
      ...quota,
      remaining,
    },
  };
}

/**
 * Старый helper, чтобы не ломать существующий код.
 * (возвращает "можно ли ещё грузить" в стиле твоей canCompanyIngestCall)
 */
export async function canCompanyIngestCall(companyId: string): Promise<{
  allowed: boolean;
  limit: number | null;
  remaining: number | null;
  plan: PlanKey;
  reason: "unlimited" | "limit-reached" | "within-limit";
}> {
  const quota = await getRemainingCallsQuota(companyId);

  if (quota.limit === null) {
    return {
      allowed: true,
      limit: null,
      remaining: null,
      plan: quota.plan,
      reason: "unlimited",
    };
  }

  if ((quota.remaining ?? 0) <= 0) {
    return {
      allowed: false,
      limit: quota.limit,
      remaining: 0,
      plan: quota.plan,
      reason: "limit-reached",
    };
  }

  return {
    allowed: true,
    limit: quota.limit,
    remaining: quota.remaining,
    plan: quota.plan,
    reason: "within-limit",
  };
}
