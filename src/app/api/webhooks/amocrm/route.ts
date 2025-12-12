import { NextResponse } from "next/server"; 
import { db } from "@/lib/db";
import { CallStatus, IntegrationType } from "@prisma/client";
import { canCompanyIngestCall } from "@/lib/call-quota";
import { enqueueCallProcessing } from "@/lib/workers/queue";
import { resolveManagerIdForAmoUser } from "@/lib/manager-mapping";


/**
 * Находим компанию по AmoCRM webhook (account.id, domain, subdomain).
 */
async function resolveCompanyIdFromWebhook(body: any): Promise<string | null> {
  const account = body?.account ?? body?.account_data ?? null;
  const accountId = account?.id ?? body?.account_id ?? null;
  const subdomain = account?.subdomain ?? account?.subdomain_name ?? null;

  const derivedDomain = subdomain ? `${subdomain}.amocrm.ru` : null;

  const integrations = await db.integration.findMany({
    where: { type: IntegrationType.AMOCRM, enabled: true },
    select: { companyId: true, config: true },
  });

  for (const integ of integrations) {
    const cfg: any = integ.config ?? {};

    const cfgAccountId = cfg.accountId ?? cfg.account_id ?? cfg.id;
    const cfgDomain = cfg.domain ?? cfg.apiDomain;

    const matchAccount =
      accountId && cfgAccountId && String(cfgAccountId) === String(accountId);

    const matchDomain =
      derivedDomain &&
      cfgDomain &&
      String(cfgDomain).toLowerCase() === derivedDomain.toLowerCase();

    if (matchAccount || matchDomain) {
      return integ.companyId;
    }
  }

  return null;
}

/**
 * Универсальный извлекатель данных звонка из любых форматов AmoCRM.
 */
function extractCallPayload(body: any) {
  const src =
    Array.isArray(body?.events) && body.events.length > 0
      ? body.events[0]
      : body.call ??
        body.calls?.[0] ??
        body.payload ??
        body.note ??
        body ??
        {};

  const externalId =
    src.call_id ??
    src.unique_id ??
    src.external_id ??
    src.id ??
    src.uuid ??
    null;

  const audioUrl =
    src.recording_url ??
    src.audio_url ??
    src.url ??
    src.link ??
    src.record ??
    null;

  const durationRaw =
    src.talk_time ??
    src.duration ??
    src.len ??
    src.length ??
    src.call_duration ??
    null;

  const duration =
    typeof durationRaw === "number"
      ? durationRaw
      : durationRaw
      ? Number(durationRaw)
      : null;

  const parseDate = (v: any) => {
    if (!v) return null;
    if (typeof v === "number") return new Date(v * 1000);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  const startedAt =
    src.started_at ??
    src.start_time ??
    src.date_create ??
    src.created_at ??
    null;

  const occurredAt = parseDate(startedAt) ?? new Date();

  return {
    externalId: externalId ? String(externalId) : null,
    audioUrl: audioUrl ? String(audioUrl) : null,
    duration: duration ?? null,
    leadId: src.lead_id ?? src.entity_id ?? null,
    contactId: src.contact_id ?? null,
    userId: src.user_id ?? src.responsible_user_id ?? null,
    phone: src.phone ?? src.from ?? src.to ?? null,
    direction: src.direction ?? src.call_direction ?? null,
    occurredAt,
    raw: src,
  };
}

export async function POST(req: Request) {
  let rawBody = "";
  let body: any = {};

  try {
    rawBody = await req.text();

    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      body = { raw: rawBody };
    }
  } catch (err) {
    console.error("[AMO WEBHOOK] Failed to read body", err);
    return NextResponse.json(
      { ok: false, error: "failed_to_read_body" },
      { status: 200 }
    );
  }

  console.log("AMO WEBHOOK RAW:", rawBody.slice(0, 1500));

  try {
    const companyId = await resolveCompanyIdFromWebhook(body);

    if (!companyId) {
      console.warn("[AMO WEBHOOK] Company not found", body?.account);
      return NextResponse.json(
        { ok: false, error: "company_not_found" },
        { status: 200 }
      );
    }

    const quota = await canCompanyIngestCall(companyId);
    if (!quota.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "quota_exceeded",
          plan: quota.plan,
          limit: quota.limit,
          remaining: quota.remaining,
        },
        { status: 200 }
      );
    }

  const payload = extractCallPayload(body);


    // Пробуем привязать менеджера по Amo user id (userId / responsible_user_id)
    const managerId =
      payload.userId != null
        ? await resolveManagerIdForAmoUser(companyId, payload.userId)
        : null;

    if (!payload.externalId) {
      console.warn("[AMO WEBHOOK] Missing externalId in payload, skip");
      return NextResponse.json(
        { ok: false, error: "missing_external_call_id" },
        { status: 200 }
      );
    }


    // Deduplication
    const existing = await db.call.findFirst({
      where: { companyId, externalId: payload.externalId },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { ok: true, skipped: true, callId: existing.id },
        { status: 200 }
      );
    }

    // Create Call
    const call = await db.call.create({
      data: {
        companyId,
        managerId, // ← привязка менеджера
        externalId: payload.externalId,
        // сохраняем внешний URL в audioUrlExternal, audioUrl пока можно держать тем же
        audioUrl: payload.audioUrl,
        audioUrlExternal: payload.audioUrl,
        duration: payload.duration,
        occurredAt: payload.occurredAt,
        status: CallStatus.NEW,
        meta: {
          source: "amocrm-webhook",
          raw: payload.raw,
          leadId: payload.leadId,
          contactId: payload.contactId,
          userId: payload.userId,
          phone: payload.phone,
          direction: payload.direction,
        },
      },
    });

    await enqueueCallProcessing({ callId: call.id });

    return NextResponse.json(
      {
        ok: true,
        callId: call.id,
        companyId,
        plan: quota.plan,
        limit: quota.limit,
        remaining: quota.remaining,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[AMO WEBHOOK] Handler failed:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "internal_error",
        message: err?.message ?? String(err),
      },
      { status: 200 }
    );
  }
}
