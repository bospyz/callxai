// src/lib/call-quota.ts

import { db } from "@/lib/db";
import { SubscriptionStatus } from "@prisma/client";

/**
 * План тарифа (нормализованный ключ)
 */
export type PlanKey = "free" | "start" | "pro" | "enterprise";

/**
 * Расчёт квоты по звонкам (на период)
 */
export type CallsQuota = {
  plan: PlanKey;

  /**
   * Лимит на период. null => безлимит
   */
  limit: number | null;

  /**
   * Использовано "боевых" звонков в периоде
   */
  used: number;

  /**
   * Осталось. null => безлимит
   */
  remaining: number | null;

  /**
   * Минимальная длительность звонка, которую считаем "боевой" (сек).
   */
  billableMinDurationSec: number;

  /**
   * Период, по которому считали
   */
  period: {
    start: Date;
    end: Date;
  };

  /**
   * Причина/статус, чтобы UI мог объяснить ограничение
   */
  reason:
    | "no-subscription"
    | "within-free-limit"
    | "free-limit-exceeded"
    | "paid-plan-limited"
    | "paid-plan-unlimited";
};

/**
 * Бизнес-логика:
 * - если подписки нет: FREE (и лимит free)
 * - если подписка есть и ACTIVE:
 *    - enterprise: unlimited
 *    - иначе: лимит либо из sub.callsLimitPerMonth, либо fallback
 *
 * Важно:
 * Лимиты считаются по "боевым" звонкам >= billableMinDurationSec.
 */

/* =========================
   Plan normalization
========================= */

export function normalizePlan(raw?: string | null): PlanKey {
  if (!raw) return "free";
  const v = raw.toLowerCase().trim();

  if (v === "enterprise" || v === "ent" || v.includes("enterprise")) return "enterprise";
  if (v === "pro" || v.includes("pro")) return "pro";
  if (v === "start" || v === "basic" || v.includes("start") || v.includes("basic")) return "start";
  return "free";
}

/* =========================
   Limits + billable rules
========================= */

export function getLimitForPlan(plan: PlanKey): number | null {
  switch (plan) {
    case "free":
      return 30;
    case "start":
      return 2000;
    case "pro":
      return 10000;
    case "enterprise":
      return null;
    default:
      return 30;
  }
}

/**
 * Минимальная длительность "боевого" звонка.
 * Важно: используй это же правило на этапе ingest (чтобы нельзя было обойти квоту).
 */
export function getBillableMinDurationSec(plan: PlanKey): number {
  // Можно различать по тарифам. Сейчас фикс.
  // Не оставляем unused param — это ломало lint у тебя.
  void plan;
  return 30;
}

/* =========================
   Periods
========================= */

function getCurrentMonthBounds(now = new Date()) {
  // Период = календарный месяц по серверному времени.
  // Если хочешь “rolling 30 days” — делай другой расчёт и храни periodKey.
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

/* =========================
   Subscription read
========================= */

type SubscriptionLike = {
  plan: string | null;
  callsLimitPerMonth: number | null;
};

/**
 * Читает ACTIVE подписку.
 * Важно: выбираем только нужные поля, без any.
 * Если callsLimitPerMonth реально нет в твоей модели Subscription — убери это поле здесь и ниже.
 */
async function getActiveSubscription(companyId: string): Promise<SubscriptionLike | null> {
  const sub = await db.subscription.findFirst({
    where: { companyId, status: SubscriptionStatus.ACTIVE },
    orderBy: { createdAt: "desc" },
    select: {
      plan: true,
      callsLimitPerMonth: true,
    },
  });

  if (!sub) return null;

  // Prisma type может не знать поле callsLimitPerMonth, если его нет.
  // Поэтому явно нормализуем.
  const plan = (sub as any).plan as string | null;
  const callsLimitPerMonth =
    typeof (sub as any).callsLimitPerMonth === "number" ? ((sub as any).callsLimitPerMonth as number) : null;

  return { plan, callsLimitPerMonth };
}

/* =========================
   Counting calls (billable)
========================= */

/**
 * Критично: считать надо по "дате факта звонка" (occurredAt/startedAt),
 * а не по createdAt (иначе sync задним числом ломает квоты).
 *
 * Если у тебя нет occurredAt — оставляем createdAt.
 * Рекомендация для продажи: добавить occurredAt и считать по нему.
 */
function getCallPeriodFieldName(): "occurredAt" | "createdAt" {
  // Нельзя проверить схему Prisma в runtime корректно.
  // Поэтому держи как константу и переключай при добавлении поля.
  // Если у тебя уже есть occurredAt — просто поменяй на "occurredAt".
  return "createdAt";
}

async function countBillableCallsInPeriod(params: {
  companyId: string;
  start: Date;
  end: Date;
  billableMinDurationSec: number;
}): Promise<number> {
  const periodField = getCallPeriodFieldName();

  const where: any = {
    companyId: params.companyId,
    duration: { gte: params.billableMinDurationSec },
  };

  where[periodField] = { gte: params.start, lt: params.end };

  return db.call.count({ where });
}

/* =========================
   Core API
========================= */

export async function getCallsQuota(companyId: string): Promise<CallsQuota> {
  const period = getCurrentMonthBounds();
  const sub = await getActiveSubscription(companyId);

  // No subscription => free plan
  if (!sub) {
    const plan: PlanKey = "free";
    const billableMinDurationSec = getBillableMinDurationSec(plan);
    const limit = getLimitForPlan(plan);

    const used = await countBillableCallsInPeriod({
      companyId,
      start: period.start,
      end: period.end,
      billableMinDurationSec,
    });

    const remaining = limit === null ? null : Math.max(limit - used, 0);

    return {
      plan,
      limit,
      used,
      remaining,
      billableMinDurationSec,
      period,
      reason: remaining !== null && remaining <= 0 ? "free-limit-exceeded" : "within-free-limit",
    };
  }

  const plan = normalizePlan(sub.plan);
  const billableMinDurationSec = getBillableMinDurationSec(plan);

  // Enterprise => unlimited
  if (plan === "enterprise") {
    return {
      plan,
      limit: null,
      used: 0,
      remaining: null,
      billableMinDurationSec,
      period,
      reason: "paid-plan-unlimited",
    };
  }

  const fallbackLimit = getLimitForPlan(plan);
  const limit = sub.callsLimitPerMonth ?? fallbackLimit;

  // If limit unexpectedly null (shouldn't happen for non-enterprise) — treat as unlimited.
  if (limit === null) {
    return {
      plan,
      limit: null,
      used: 0,
      remaining: null,
      billableMinDurationSec,
      period,
      reason: "paid-plan-unlimited",
    };
  }

  const used = await countBillableCallsInPeriod({
    companyId,
    start: period.start,
    end: period.end,
    billableMinDurationSec,
  });

  const remaining = Math.max(limit - used, 0);

  return {
    plan,
    limit,
    used,
    remaining,
    billableMinDurationSec,
    period,
    reason: remaining <= 0 ? "paid-plan-limited" : "paid-plan-limited",
  };
}

export async function getRemainingCallsQuota(companyId: string): Promise<CallsQuota> {
  // alias
  return getCallsQuota(companyId);
}

/**
 * Для импорта пачки: вернуть сколько можно “принять” сейчас.
 * Важно: это ОЦЕНКА.
 * Реальную защиту надо делать при записи каждого звонка (idempotent + atomic checks).
 */
export async function getQuotaForImport(
  companyId: string,
  requested: number
): Promise<{ allowed: number; quota: CallsQuota }> {
  const quota = await getCallsQuota(companyId);

  if (quota.limit === null) return { allowed: requested, quota };

  const remaining = quota.remaining ?? 0;
  const allowed = Math.max(Math.min(requested, remaining), 0);

  return { allowed, quota: { ...quota, remaining } };
}

/**
 * Проверка "можно ли принять ещё один billable call".
 * Важно: это не атомарно. Для железобетона — enforce на уровне DB (см. ниже).
 */
export async function canCompanyIngestCall(companyId: string): Promise<{
  allowed: boolean;
  limit: number | null;
  remaining: number | null;
  plan: PlanKey;
  reason: "unlimited" | "limit-reached" | "within-limit" | "no-subscription";
}> {
  const quota = await getCallsQuota(companyId);

  if (quota.limit === null) {
    return { allowed: true, limit: null, remaining: null, plan: quota.plan, reason: "unlimited" };
  }

  const remaining = quota.remaining ?? 0;

  if (remaining <= 0) {
    return { allowed: false, limit: quota.limit, remaining: 0, plan: quota.plan, reason: "limit-reached" };
  }

  // differentiate "no-subscription" for UI
  if (quota.reason === "within-free-limit" || quota.reason === "free-limit-exceeded") {
    return { allowed: true, limit: quota.limit, remaining, plan: quota.plan, reason: "no-subscription" };
  }

  return { allowed: true, limit: quota.limit, remaining, plan: quota.plan, reason: "within-limit" };
}

/* =========================
   Hardening notes (important)
========================= */

/**
 * ВАЖНО для предотвращения обхода квоты:
 * 1) В ingest pipeline, перед тем как помечать звонок как billable,
 *    используй ТО ЖЕ правило billableMinDurationSec.
 * 2) Сделай идемпотентность по (companyId, externalCallId, source)
 * 3) Для атомарного enforce лимита:
 *    - заведи UsageCounter таблицу (companyId, periodKey, usedBillableCalls)
 *    - инкремент через транзакцию и проверку <= limit
 *    Иначе при параллельном sync можно превысить лимит гонкой.
 */
