// src/lib/call-quota.ts

import { db } from "@/lib/db";
import { SubscriptionStatus } from "@prisma/client";

// 🔹 Фри-лимит: первые 30 звонков (>= 30 сек)
const FREE_CALLS_LIMIT = 30;

// 🔹 Минимальная длительность звонка, который считается "боевым"
const BILLABLE_MIN_DURATION_SEC = 30;

// 🔹 Лимиты по планам (по количеству "боевых" звонков)
const PLAN_LIMITS: Record<string, number | null> = {
  // Базовая подписка: 2000 звонков >= 30 сек
  start: 2000,
  basic: 2000,

  // PRO — можно задать свой лимит или сделать безлимит
  pro: null,

  // TEAM / ENTERPRISE — без лимита
  team: null,
  enterprise: null,
};

type QuotaReason =
  | "no-subscription"          // только фри-лимит
  | "within-free-limit"
  | "free-limit-exceeded"
  | "paid-plan-limited"        // платный, но с лимитом
  | "paid-plan-unlimited";     // платный без лимита

export async function canCompanyIngestCall(companyId: string) {
  // 1) Проверяем активную подписку компании
  const activeSub = await db.subscription.findFirst({
    where: {
      companyId,
      status: SubscriptionStatus.ACTIVE,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // === СЛУЧАЙ 1: НЕТ ПОДПИСКИ → только 30 фри-звонков (>= 30 сек) ===
  if (!activeSub) {
    const callsCount = await db.call.count({
      where: {
        companyId,
        duration: {
          gte: BILLABLE_MIN_DURATION_SEC, // считаем только нормальные звонки
        },
      },
    });

    if (callsCount >= FREE_CALLS_LIMIT) {
      return {
        allowed: false,
        reason: "free-limit-exceeded" as QuotaReason,
        limit: FREE_CALLS_LIMIT,
        callsCount,
        remaining: 0,
        billableMinDurationSec: BILLABLE_MIN_DURATION_SEC,
      };
    }

    return {
      allowed: true,
      reason:
        callsCount > 0 ? "within-free-limit" : "no-subscription",
      limit: FREE_CALLS_LIMIT,
      callsCount,
      remaining: FREE_CALLS_LIMIT - callsCount,
      billableMinDurationSec: BILLABLE_MIN_DURATION_SEC,
    };
  }

  // === СЛУЧАЙ 2: ЕСТЬ АКТИВНАЯ ПОДПИСКА ===
  const planKey = activeSub.plan.toLowerCase();

  const planLimit = PLAN_LIMITS.hasOwnProperty(planKey)
    ? PLAN_LIMITS[planKey]!
    : null;

  // Если план без лимита — бесконечные боевые звонки
  if (planLimit === null) {
    return {
      allowed: true,
      reason: "paid-plan-unlimited" as QuotaReason,
      limit: null,
      callsCount: null,
      remaining: null,
      billableMinDurationSec: BILLABLE_MIN_DURATION_SEC,
    };
  }

  // План с ограничением по количеству боевых звонков
  const callsCount = await db.call.count({
    where: {
      companyId,
      duration: {
        gte: BILLABLE_MIN_DURATION_SEC,
      },
    },
  });

  const remaining = planLimit - callsCount;

  if (remaining <= 0) {
    return {
      allowed: false,
      reason: "paid-plan-limited" as QuotaReason,
      limit: planLimit,
      callsCount,
      remaining: 0,
      billableMinDurationSec: BILLABLE_MIN_DURATION_SEC,
    };
  }

  return {
    allowed: true,
    reason: "paid-plan-limited" as QuotaReason,
    limit: planLimit,
    callsCount,
    remaining,
    billableMinDurationSec: BILLABLE_MIN_DURATION_SEC,
  };
}
