// src/lib/amocrm-sync.ts
import { db } from "@/lib/db";
import { enqueueCallTask } from "@/lib/workers/task-queue";
import { amoRequest, normalizeAmoCall } from "@/lib/amocrm";

export async function syncAmoRecentCalls(params: {
  companyId: string;

  // сколько "боевых" (>= minDurationSec) надо СОЗДАТЬ
  limit?: number;

  // период в днях
  days?: number;

  // фильтр коротких
  skipShort?: boolean;

  // порог длительности (обычно 30)
  minDurationSec?: number;

  // safety cap по количеству сырых записей, чтобы не уйти в бесконечность
  scanMax?: number;

  // пагинация: размер страницы
  perPage?: number;

  // ключ embedded
  embeddedKey?: string;

  // endpoint
  path?: string;
}): Promise<{
  ok: boolean;
  created: number;        // создано боевых
  scanned: number;        // просмотрено сырых
  skippedShort: number;   // отфильтровано как короткие/без duration
  skippedExists: number;  // пропущено как уже существующие
  durationMissing: number; // duration=0/undefined
  durationLt: number;      // duration < minDurationSec
  durationGte: number;     // duration >= minDurationSec
  message: string;
}> {
  const path = params.path || process.env.AMO_CALLS_PATH;
  if (!path) {
    return {
      ok: false,
      created: 0,
      scanned: 0,
      skippedShort: 0,
      skippedExists: 0,
      durationMissing: 0,
      durationLt: 0,
      durationGte: 0,
      message: "AMO_CALLS_PATH not set",
    };
  }

  const limit = Math.max(1, Math.min(5000, Number(params.limit ?? 50) || 50));
  const days = Math.max(1, Math.min(90, Number(params.days ?? 7) || 7));
  const skipShort = Boolean(params.skipShort ?? false);
  const minDurationSec = Math.max(0, Number(params.minDurationSec ?? 0) || 0);

  const perPage = Math.max(10, Math.min(250, Number(params.perPage ?? 50) || 50));
  const embeddedKey = params.embeddedKey ?? "items";

  // чем больше short-звонков в amo, тем больше нужно сканировать сырья
  const scanMax = Math.max(Number(params.scanMax ?? 0) || 0, limit * 50, 20000);

  const sinceIso = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  let created = 0;
  let scanned = 0;
  let skippedShort = 0;
  let skippedExists = 0;

  let durationMissing = 0;
  let durationLt = 0;
  let durationGte = 0;

  // защита от "пагинация не работает и возвращает одну и ту же страницу"
  const seenPageFingerprints = new Set<string>();

  for (let page = 1; ; page++) {
    if (created >= limit) break;
    if (scanned >= scanMax) break;

    const raw = await amoRequest<any>({
      companyId: params.companyId,
      method: "GET",
      path,
      query: {
        page,
        limit: perPage,
        since: sinceIso,
      },
    });

    const items: any[] =
      (Array.isArray(raw) ? raw : null) ??
      raw?._embedded?.[embeddedKey] ??
      raw?._embedded?.items ??
      raw?._embedded?.calls ??
      raw?.items ??
      [];

    if (!items.length) break;

    // fingerprint page
    const ids = items
      .map((x) => String(x?.id ?? x?.uuid ?? ""))
      .filter(Boolean);
    const fp = ids.slice(0, 20).join("|");
    if (fp && seenPageFingerprints.has(fp)) break;
    if (fp) seenPageFingerprints.add(fp);

    for (const it of items) {
      if (created >= limit) break;
      if (scanned >= scanMax) break;

      scanned += 1;

      const dto = normalizeAmoCall(it);
      if (!dto) continue;

      const duration = dto.durationSec ?? 0;

      if (!duration) durationMissing += 1;
      else if (duration < minDurationSec) durationLt += 1;
      else durationGte += 1;

      // ключевое: короткие/без duration НЕ СОЗДАЁМ
      if (skipShort) {
        if (!duration || duration < minDurationSec) {
          skippedShort += 1;
          continue;
        }
      }

      const exists = await db.call.findFirst({
        where: { companyId: params.companyId, externalId: dto.externalId },
        select: { id: true },
      });
      if (exists) {
        skippedExists += 1;
        continue;
      }

      const call = await db.call.create({
        data: {
          companyId: params.companyId,
          externalId: dto.externalId,
          occurredAt: dto.occurredAt ?? new Date(),
          duration: dto.durationSec ?? 0,
          direction: dto.direction ?? "unknown",
          phone: dto.phone ?? null,
          audioUrl: dto.audioUrl ?? null,
          status: "NEW",
          meta: dto.raw ?? {},
        } as any,
        select: { id: true },
      });

      created += 1;
      await enqueueCallTask(call.id);
    }

    if (items.length < perPage) break;
  }

  const msg =
    created >= limit
      ? `Synced ${created} billable calls`
      : `Only ${created} billable calls found for this period (need ${limit}).`;

  return {
    ok: true,
    created,
    scanned,
    skippedShort,
    skippedExists,
    durationMissing,
    durationLt,
    durationGte,
    message: `${msg} (scanned=${scanned}, skippedShort=${skippedShort}, skippedExists=${skippedExists}, missingDur=${durationMissing}, lt=${durationLt}, gte=${durationGte})`,
  };
}
