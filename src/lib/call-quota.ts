// src/lib/call-quota.ts

import { db } from "./db";
import { SubscriptionStatus } from "@prisma/client";

export type PlanKey = "free" | "start" | "pro" | "enterprise";

export type CallsQuota = {
  plan: PlanKey;
  limit: number | null; // null = безлимит
  used: number; // сколько звонков (>= 30 сек) уже есть за период
  remaining: number | null; // сколько ещё можно
};

/**
 * Нормализуем название плана из subscription.plan
 * Примеры:
 *  - "FREE", "free" -> free
 *  - "start", "basic", "start-200" -> start
 *  - "pro", "pro-2000" -> pro
 *  - "enterprise", "ent" -> enterprise
 */
export function normalizePlan(raw?: string | null): PlanKey {
  if (!raw) return "free";
  const v = raw.toLowerCase().trim();

  if (v.includes("enterprise") || v === "ent") return "enterprise";
  if (v.includes("pro")) return "pro";
  if (v.includes("start") || v.includes("basic")) return "start";

  return "free";
}

/**
 * Лимит по плану (боевые звонки длительностью >= 30 сек).
 * Здесь фиксируем твой прайсинг:
 *  - free: 30
 *  - start: 200
 *  - pro: 2000
 *  - enterprise: безлимит
 *
 * При желании можно завязать на ENV.
 */
export function getLimitForPlan(plan: PlanKey): number | null {
  switch (plan) {
    case "free":
      return 30;
    case "start":
      return 200;
    case "pro":
      return 2000;
    case "enterprise":
      return null; // без лимита
    default:
      return 30;
  }
}

/**
 * Текущий биллинг-период — календарный месяц.
 */
function getCurrentPeriodBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

/**
 * Считает, сколько звонков компания уже использовала в текущем месяце.
 * Учитываем только звонки длительностью >= 30 сек.
 */
async function countCompanyCallsForCurrentMonth(
  companyId: string
): Promise<number> {
  const { start, end } = getCurrentPeriodBounds();

  const used = await db.call.count({
    where: {
      companyId,
      createdAt: {
        gte: start,
        lt: end,
      },
      duration: {
        gte: 30,
      },
    },
  });

  return used;
}

/**
 * БАЗОВАЯ ФУНКЦИЯ:
 * Возвращает квоту звонков для компании:
 *  - активная подписка → план
 *  - лимит по плану
 *  - used = звонки (duration >= 30) за текущий месяц
 *  - remaining
 */
export async function getCallsQuota(companyId: string): Promise<CallsQuota> {
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

  const used = await countCompanyCallsForCurrentMonth(companyId);
  const remaining = Math.max(limit - used, 0);

  return {
    plan,
    limit,
    used,
    remaining,
  };
}

/**
 * Старое имя, чтобы не ломать существующий код.
 * Теперь это просто обёртка над getCallsQuota.
 */
export async function getRemainingCallsQuota(
  companyId: string
): Promise<CallsQuota> {
  return getCallsQuota(companyId);
}

/**
 * Helper для импорта: говорит, сколько ЗАПРОШЕННЫХ звонков
 * реально можно подтянуть с учётом квоты.
 */
export async function getQuotaForImport(
  companyId: string,
  requested: number
): Promise<{ allowed: number; quota: CallsQuota }> {
  const quota = await getCallsQuota(companyId);

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
 * Главный helper, который ты уже используешь:
 * "можно ли ещё грузить один звонок" (Amo webhook, create, cron и т.п.).
 */
export async function canCompanyIngestCall(companyId: string): Promise<{
  allowed: boolean;
  limit: number | null;
  remaining: number | null;
  plan: PlanKey;
  reason: "unlimited" | "limit-reached" | "within-limit";
}> {
  const quota = await getCallsQuota(companyId);

  if (quota.limit === null) {
    return {
      allowed: true,
      limit: null,
      remaining: null,
      plan: quota.plan,
      reason: "unlimited",
    };
  }

  const remaining = quota.remaining ?? 0;

  if (remaining <= 0) {
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
    remaining,
    plan: quota.plan,
    reason: "within-limit",
  };
}
