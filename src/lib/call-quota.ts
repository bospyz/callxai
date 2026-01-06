// src/lib/call-quota.ts
import { db } from "@/lib/db";
import { SubscriptionStatus } from "@prisma/client";

export type PlanKey = "free" | "start" | "pro" | "enterprise";

export type CallsQuota = {
  plan: PlanKey;
  limit: number | null; // null => unlimited
  used: number;         // counted snapshot (billable calls)
  remaining: number | null;
  billableMinDurationSec: number;
  period: { start: Date; end: Date };
  reason:
    | "no-subscription"
    | "within-free-limit"
    | "free-limit-exceeded"
    | "paid-plan-limited"
    | "paid-plan-unlimited";
};

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

export function getBillableMinDurationSec(_plan: PlanKey): number {
  // единое правило для всех планов (можно усложнить позже)
  return 30;
}

/* =========================
   Period (calendar month)
========================= */

function getCurrentMonthBounds(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

/* =========================
   Subscription read
========================= */

type SubscriptionLike = {
  plan: string | null;
  // это поле может отсутствовать в твоей модели — поэтому читаем через any
  callsLimitPerMonth: number | null;
};

async function getActiveSubscription(companyId: string): Promise<SubscriptionLike | null> {
  const sub = await db.subscription.findFirst({
    where: { companyId, status: SubscriptionStatus.ACTIVE },
    orderBy: { createdAt: "desc" },
    select: { plan: true } as any,
  });

  if (!sub) return null;

  const plan = (sub as any).plan as string | null;
  const callsLimitPerMonth =
    typeof (sub as any).callsLimitPerMonth === "number"
      ? ((sub as any).callsLimitPerMonth as number)
      : null;

  return { plan, callsLimitPerMonth };
}

/* =========================
   Counting billable calls
========================= */

function getCallPeriodFieldName(): "occurredAt" | "createdAt" {
  // В твоей схеме ты используешь occurredAt в Call.create (в amocrm-sync).
  // Значит, квоту корректнее считать по occurredAt.
  return "occurredAt";
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

  // safety: treat null as unlimited
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

/**
 * Alias — оставлен для обратной совместимости
 */
export async function getRemainingCallsQuota(companyId: string): Promise<CallsQuota> {
  return getCallsQuota(companyId);
}

/**
 * Для импорта пачки (оценка): сколько можно принять сейчас.
 * Реальный enforce делай в processCall (billable списывается по факту).
 */
export async function getQuotaForImport(companyId: string, requested: number): Promise<{
  allowed: number;
  quota: CallsQuota;
}> {
  const quota = await getCallsQuota(companyId);
  if (quota.limit === null) return { allowed: requested, quota };
  const remaining = quota.remaining ?? 0;
  return { allowed: Math.max(Math.min(requested, remaining), 0), quota };
}

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

  if (quota.plan === "free") {
    return { allowed: true, limit: quota.limit, remaining, plan: quota.plan, reason: "no-subscription" };
  }

  return { allowed: true, limit: quota.limit, remaining, plan: quota.plan, reason: "within-limit" };
}

/* =========================
   The missing function: incrementCallsQuota
========================= */

/**
 * ВАЖНО:
 * В текущей архитектуре quota.used считается через db.call.count (snapshot),
 * поэтому атомарного "increment" без отдельной Usage-таблицы нет.
 *
 * Но чтобы:
 * - не ломать build,
 * - сохранить контракт,
 * - дать возможность вызывать это в processCall,
 *
 * мы делаем best-effort:
 * 1) проверяем квоту snapshot,
 * 2) если лимит исчерпан — кидаем ошибку,
 * 3) иначе просто возвращаем новый snapshot.
 *
 * Если хочешь железобетон — добавим таблицу UsageCounter и сделаем транзакционный инкремент.
 */
export async function incrementCallsQuota(companyId: string, n = 1): Promise<CallsQuota> {
  const quota = await getCallsQuota(companyId);

  if (n <= 0) return quota;

  // unlimited
  if (quota.limit === null) return quota;

  const remaining = quota.remaining ?? 0;

  if (remaining - n < 0) {
    // здесь можно кинуть HttpError(402) если у тебя есть http-error
    throw new Error("Calls quota exceeded");
  }

  // Ничего не пишем в БД: used считается как snapshot.
  // Возвращаем актуальную квоту (для UI/логики достаточно).
  return await getCallsQuota(companyId);
}
