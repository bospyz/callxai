// src/app/api/webhooks/sipuni/call-ended/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CallStatus, CallTaskStatus, CallDirection } from "@prisma/client";
import { enqueueCallTask } from "@/lib/workers/task-queue";
import { resolveManagerIdForAmoUser } from "@/lib/manager-mapping"; // optional, если маппишь на Manager
import crypto from "crypto";

/**
 * Sipuni → CallXAI webhook (call ended / record ready)
 *
 * ВАЖНО:
 * 1) Sipuni должен присылать: call_id + record_url (или запись/ссылка)
 * 2) companyId мы определяем по secret/token (или по sipuni_account_id)
 * 3) occurredAt НЕ подменяем, иначе preview по периоду ломается
 *
 * ENV:
 * - SIPUNI_WEBHOOK_SECRET (рекомендовано)
 *
 * Если у Sipuni другой формат payload — просто адаптируй parseSipuniPayload().
 */

type SipuniDirection = "in" | "out" | "inbound" | "outbound" | "incoming" | "outgoing";

type SipuniWebhookPayload = {
  call_id?: string | number;
  uuid?: string;
  unique_id?: string;

  started_at?: string | number; // ISO или unix sec/ms
  ended_at?: string | number;

  duration?: number | string; // seconds
  direction?: SipuniDirection | string;

  from?: string | null; // caller
  to?: string | null; // callee/line

  record_url?: string | null; // КЛЮЧЕВОЕ
  recording_url?: string | null;

  operator_id?: string | number | null; // менеджер/оператор в Sipuni
  user_id?: string | number | null;

  // если Sipuni даёт account id / domain
  account_id?: string | number | null;

  // raw passthrough
  [k: string]: any;
};

function toNumber(v: any): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDate(v: any): Date | null {
  if (v == null) return null;

  // unix seconds/ms
  if (typeof v === "number") {
    const ms = v > 10_000_000_000 ? v : v * 1000; // > ~2286-11-20 in seconds => treat as ms
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  // numeric string
  if (typeof v === "string" && /^\d+$/.test(v.trim())) {
    const num = Number(v.trim());
    const ms = num > 10_000_000_000 ? num : num * 1000;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  // ISO string
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  return null;
}

function mapDirection(v?: string | null): CallDirection {
  const s = (v ?? "").toString().trim().toLowerCase();
  if (["in", "inbound", "incoming", "1"].includes(s)) return CallDirection.INBOUND;
  if (["out", "outbound", "outgoing", "2"].includes(s)) return CallDirection.OUTBOUND;
  return CallDirection.UNKNOWN;
}

function pickExternalId(p: SipuniWebhookPayload): string | null {
  const raw =
    p.call_id ?? p.unique_id ?? p.uuid ?? null;
  if (raw == null) return null;
  const id = String(raw).trim();
  return id ? id : null;
}

function pickAudioUrl(p: SipuniWebhookPayload): string | null {
  const url =
    (typeof p.record_url === "string" && p.record_url.trim()) ||
    (typeof p.recording_url === "string" && p.recording_url.trim()) ||
    null;
  return url || null;
}

/**
 * Пример простой проверки подписи/секрета:
 * - Sipuni может присылать header вроде X-Sipuni-Signature / X-Signature / Authorization
 * - Если у тебя в Sipuni можно указать "секрет" и он приходит как параметр — тоже ок
 *
 * Адаптируй под реальные поля Sipuni у тебя.
 */
function verifyWebhook(req: NextRequest, rawBody: string): boolean {
  const secret = process.env.SIPUNI_WEBHOOK_SECRET;
  if (!secret) return true; // если не настроил — не блокируем dev

  // 1) Попробуем header signature (HMAC-SHA256 rawBody)
  const sig =
    req.headers.get("x-sipuni-signature") ||
    req.headers.get("x-signature") ||
    "";

  if (sig) {
    const h = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    // поддержим варианты "sha256=..." или просто hex
    const normalized = sig.startsWith("sha256=") ? sig.slice("sha256=".length) : sig;
    return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(normalized));
  }

  // 2) Попробуем bearer token
  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim() === secret;
  }

  // 3) Если ничего не пришло — считаем недоверенным
  return false;
}

/**
 * companyId определяем так:
 * - В идеале: Sipuni webhook url уникальный на компанию:
 *    /api/webhooks/sipuni/{companyId}/call-ended
 * - Или: по account_id -> integration.config.sipuniAccountId
 * - Или: по секрету (лучше всего: отдельный секрет на компанию)
 *
 * Здесь даю простой вариант: один секрет на env + account_id маппим через Integration.
 */
async function resolveCompanyIdFromPayload(p: SipuniWebhookPayload): Promise<string | null> {
  // ВАРИАНТ 1 (рекомендовано): companyId в query ?companyId=...
  // -> убери это, если не хочешь светить companyId наружу.
  // В этом файле мы это НЕ используем намеренно.

  // ВАРИАНТ 2: account_id из Sipuni маппим на Integration.config
  const accountId = p.account_id != null ? String(p.account_id) : null;
  if (!accountId) return null;

  const integ = await db.integration.findFirst({
    where: { type: "SIPUNI", enabled: true }, // если у тебя IntegrationType.SIPUNI — замени
  });

  // Если у тебя нет SIPUNI типа в prisma — сделай тип "WEBHOOK" или "TELEPHONY"
  // и храни account_id там. Ниже показан общий паттерн.
  if (!integ) return null;

  const cfg = (integ.config ?? {}) as any;
  if (String(cfg?.accountId ?? "") !== accountId) return null;

  return integ.companyId;
}

export async function POST(req: NextRequest) {
  // 1) читаем RAW body (для подписи)
  const rawBody = await req.text();

  // 2) verify
  if (!verifyWebhook(req, rawBody)) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  // 3) parse JSON
  let payload: SipuniWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, message: "invalid_json" }, { status: 400 });
  }

  // 4) companyId
  const companyId = await resolveCompanyIdFromPayload(payload);
  if (!companyId) {
    // чтобы было видно в логах, но не падало совсем
    console.error("[SIPUNI webhook] companyId not resolved", {
      account_id: payload.account_id,
      call_id: payload.call_id,
    });
    return NextResponse.json({ ok: false, message: "company_not_resolved" }, { status: 400 });
  }

  // 5) extract call fields
  const externalId = pickExternalId(payload);
  if (!externalId) {
    return NextResponse.json({ ok: false, message: "missing_call_id" }, { status: 400 });
  }

  const audioUrlExternal = pickAudioUrl(payload);

  const occurredAt =
    toDate(payload.started_at) ||
    toDate(payload.ended_at) ||
    null;

  if (!occurredAt) {
    // occurredAt обязателен, иначе preview по периоду не сработает
    return NextResponse.json({ ok: false, message: "missing_occurredAt" }, { status: 400 });
  }

  const durationSec = toNumber(payload.duration);
  const direction = mapDirection(payload.direction ?? null);

  const clientPhone =
    (typeof payload.from === "string" && payload.from.trim()) ? payload.from.trim() : null;
  const linePhone =
    (typeof payload.to === "string" && payload.to.trim()) ? payload.to.trim() : null;

  // 6) upsert call (idempotent)
  const existing = await db.call.findFirst({
    where: { companyId, externalId },
    select: { id: true },
  });

  if (existing) {
    // если запись пришла позже — можем "дозалить" audioUrlExternal
    if (audioUrlExternal) {
      await db.call.update({
        where: { id: existing.id },
        data: {
          audioUrlExternal,
          duration: durationSec ?? undefined,
          occurredAt, // не меняем, но если было null (теоретически) — дозальём
          direction,
          clientPhone,
          linePhone,
          meta: {
            ...(typeof (payload as any) === "object" ? { sipuni: payload } : {}),
          } as any,
        },
      });

      // ensure CallTask exists if we got audio now
      await db.callTask.upsert({
        where: { callId: existing.id },
        create: { callId: existing.id, status: CallTaskStatus.NEW, attempts: 0, error: null },
        update: { status: CallTaskStatus.NEW, error: null, lockedAt: null, nextRunAt: null },
      });

      await enqueueCallTask(existing.id);
    }

    return NextResponse.json({ ok: true, existed: true, callId: existing.id });
  }

  // 7) optional manager mapping (если хочешь связывать sipuni operator_id -> Manager)
  // Сейчас даю заглушку: можешь сделать отдельный mapping (как ты делал для amoUserId)
  // Например, храни sipuniOperatorId в Manager или отдельной таблице.
  let managerId: string | null = null;
  const operatorId = payload.operator_id ?? payload.user_id ?? null;
  if (operatorId != null) {
    // временно используем твою amo mapping функцию, если ты туда положишь правила
    // иначе просто закомментируй это.
    managerId = await resolveManagerIdForAmoUser(companyId, Number(operatorId)).catch(() => null);
  }

  // 8) create Call
  const call = await db.call.create({
    data: {
      companyId,
      managerId,
      externalId,

      occurredAt,
      duration: durationSec,
      direction,

      clientPhone,
      linePhone,

      audioUrlExternal: audioUrlExternal,
      audioUrl: null,

      status: CallStatus.NEW,

      meta: {
        source: "sipuni-webhook",
        sipuni: payload,
      } as any,
    } as any,
    select: { id: true },
  });

  // 9) create task only if audio exists
  if (audioUrlExternal) {
    await db.callTask.upsert({
      where: { callId: call.id },
      create: { callId: call.id, status: CallTaskStatus.NEW, attempts: 0, error: null },
      update: { status: CallTaskStatus.NEW, error: null, lockedAt: null, nextRunAt: null },
    });

    await enqueueCallTask(call.id);
  }

  return NextResponse.json({
    ok: true,
    existed: false,
    callId: call.id,
    hasAudio: Boolean(audioUrlExternal),
  });
}
