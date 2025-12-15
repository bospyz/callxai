// src/lib/amocrm-sync.ts
import { db } from "@/lib/db";
import { enqueueCallTask } from "@/lib/workers/task-queue";
import { amoRequest, normalizeAmoCall } from "@/lib/amocrm";

type StopReason = "limit" | "scanMax" | "repeatPage" | "noItems" | "shortPage";

export async function syncAmoRecentCalls(params: {
  companyId: string;

  // сколько "боевых" (>= minDurationSec) надо СОЗДАТЬ
  limit?: number;

  // период, за который тянем сырьё (передаём в API как since)
  days?: number;

  // фильтровать короткие ДО insert
  skipShort?: boolean;

  // порог боевого звонка (обычно 30)
  minDurationSec?: number;

  // сколько "сырья" максимум сканируем
  scanMax?: number;

  // размер страницы API
  perPage?: number;

  // ключ для _embedded
  embeddedKey?: string;

  // endpoint (например "/api/v4/....")
  path?: string;
}): Promise<{
  ok: boolean;

  created: number;
  scanned: number;

  skippedShort: number;
  skippedExists: number;

  durationMissing: number;
  durationLt: number;
  durationGte: number;

  stoppedBy?: StopReason;

  lastPage: number;
  lastItemsCount: number;

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
      stoppedBy: "noItems",
      lastPage: 0,
      lastItemsCount: 0,
      message: "AMO_CALLS_PATH not set",
    };
  }

  const target = Math.max(1, Math.min(5000, Number(params.limit ?? 50) || 50));
  const days = Math.max(1, Math.min(90, Number(params.days ?? 7) || 7));
  const skipShort = Boolean(params.skipShort ?? false);
  const minDurationSec = Math.max(0, Number(params.minDurationSec ?? 0) || 0);

  const perPage = Math.max(10, Math.min(250, Number(params.perPage ?? 50) || 50));
  const embeddedKey = params.embeddedKey ?? "items";

  // scanMax должен быть большим, иначе ты не добьёшь target,
  // если много коротких/без duration/дубликатов
  const scanMax = Math.max(
    Number(params.scanMax ?? 0) || 0,
    target * 50,
    20000
  );

  const sinceIso = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  let created = 0;
  let scanned = 0;

  let skippedShort = 0;
  let skippedExists = 0;

  let durationMissing = 0;
  let durationLt = 0;
  let durationGte = 0;

  let lastPage = 0;
  let lastItemsCount = 0;

  let stoppedBy: StopReason | undefined;

  // детект: API игнорирует пагинацию и возвращает одно и то же
  const seenPageFingerprints = new Set<string>();

  function pageFingerprint(items: any[]): string {
    const ids = items
      .map((x) => String(x?.id ?? x?.uuid ?? x?.call_id ?? ""))
      .filter(Boolean);
    return ids.slice(0, 25).join("|");
  }

  for (let page = 1; ; page++) {
    if (created >= target) { stoppedBy = "limit"; break; }
    if (scanned >= scanMax) { stoppedBy = "scanMax"; break; }

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

    lastPage = page;
    lastItemsCount = items.length;

    if (!items.length) { stoppedBy = "noItems"; break; }

    const fp = pageFingerprint(items);
    if (fp) {
      if (seenPageFingerprints.has(fp)) { stoppedBy = "repeatPage"; break; }
      seenPageFingerprints.add(fp);
    }

    for (const it of items) {
      if (created >= target) { stoppedBy = "limit"; break; }
      if (scanned >= scanMax) { stoppedBy = "scanMax"; break; }

      scanned += 1;

      const dto = normalizeAmoCall(it);
      if (!dto) continue;

      const duration = dto.durationSec ?? 0;

      if (!duration) durationMissing += 1;
      else if (duration < minDurationSec) durationLt += 1;
      else durationGte += 1;

      // ключевое: короткие/неизвестные НЕ создаём
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

      // ВАЖНО: в очередь отдаём call.id, а не externalId
      await enqueueCallTask(call.id);
    }

    if (created >= target) { stoppedBy = "limit"; break; }
    if (scanned >= scanMax) { stoppedBy = "scanMax"; break; }

    if (items.length < perPage) { stoppedBy = "shortPage"; break; }
  }

  const message =
    `Synced ${created}/${target} calls ` +
    `(scanned=${scanned}, skippedShort=${skippedShort}, skippedExists=${skippedExists}, ` +
    `durationMissing=${durationMissing}, durationLt=${durationLt}, durationGte=${durationGte}, ` +
    `stoppedBy=${stoppedBy ?? "?"}, lastPage=${lastPage}, lastItemsCount=${lastItemsCount})`;

  return {
    ok: true,
    created,
    scanned,
    skippedShort,
    skippedExists,
    durationMissing,
    durationLt,
    durationGte,
    stoppedBy,
    lastPage,
    lastItemsCount,
    message,
  };
}
