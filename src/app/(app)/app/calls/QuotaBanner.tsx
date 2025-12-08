"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type QuotaResponse = {
  ok: boolean;
  companyId: string;
  plan: string | null; // делаем безопаснее
  hasActiveSub: boolean;
  reason:
    | "no-subscription"
    | "within-free-limit"
    | "free-limit-exceeded"
    | "paid-plan-limited"
    | "paid-plan-unlimited"
    | string; // на всякий случай, если бэк вернёт что-то новое
  limit: number | null;
  used: number | null;
  remaining: number | null;
  billableMinDurationSec: number;
};

export function QuotaBanner() {
  const [data, setData] = useState<QuotaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/billing/quota");
        if (!res.ok) {
          throw new Error(await res.text());
        }

        const json = (await res.json()) as QuotaResponse;
        setData(json);
      } catch (err) {
        console.error("Failed to load quota", err);
        setError("Не удалось загрузить лимит звонков");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) return null;
  if (error || !data) return null;

  const { plan, reason, limit, used, remaining, billableMinDurationSec } = data;

  // безопасные значения
  const safePlanRaw = plan ?? "FREE";
  const safePlan = safePlanRaw.toUpperCase();
  const safeReason = (reason ?? "").toString(); // тут уже не упадём

  const isFree =
    safePlan === "FREE" ||
    safeReason.startsWith("free") ||
    safeReason.includes("within-free");

  const isUnlimited =
    safeReason === "paid-plan-unlimited" || limit === null;

  const isLimitedPaid =
    safeReason === "paid-plan-limited" && typeof limit === "number";

  const isExceeded =
    (!isUnlimited && typeof remaining === "number" && remaining <= 0) ||
    safeReason === "free-limit-exceeded";

  // Текст по лимиту
  let mainText = "";
  if (isUnlimited) {
    mainText = `Тариф ${safePlan}: безлимит по боевым звонкам ≥ ${billableMinDurationSec} сек.`;
  } else if (
    isFree &&
    typeof limit === "number" &&
    used !== null &&
    remaining !== null
  ) {
    mainText = `Фри-режим: использовано ${used} из ${limit} бесплатных звонков ≥ ${billableMinDurationSec} сек. Осталось ${remaining}.`;
  } else if (
    isLimitedPaid &&
    used !== null &&
    remaining !== null &&
    typeof limit === "number"
  ) {
    mainText = `Тариф ${safePlan}: использовано ${used} из ${limit} звонков ≥ ${billableMinDurationSec} сек. Осталось ${remaining}.`;
  }

  return (
    <div className="mb-4 space-y-3">
      {/* Баннер, когда лимит закончился */}
      {isExceeded && (
        <div className="flex flex-col gap-2 rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-red-300">
              Лимит звонков по текущему тарифу закончился.
            </p>
            <p className="mt-1 text-xs text-red-200/80">
              Мы больше не будем анализировать новые звонки. Обнови тариф,
              чтобы продолжить разбирать отдел и не терять заявки.
            </p>
          </div>
          <Link
            href="/app/billing"
            className="mt-2 inline-flex items-center justify-center rounded-full bg-lime-400 px-4 py-2 text-xs font-semibold text-black transition hover:bg-lime-300 md:mt-0"
          >
            Перейти к тарифам →
          </Link>
        </div>
      )}

      {/* Статус лимитов (виден всегда, если есть данные) */}
      {mainText && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-4 py-2">
          <p className="text-xs text-neutral-300">{mainText}</p>
        </div>
      )}
    </div>
  );
}
