// src/app/api/calls/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthWithCompany } from "@/lib/auth-guard";
import { CallStatus } from "@prisma/client";

export const runtime = "nodejs";

// period: "7d", "30d", "90d", "365d", "14d", "2w", "48h" и т.п.
function parsePeriodToDays(periodParam: string | null): number {
  if (!periodParam) return 7;

  const m = /^(\d+)([hdw])$/i.exec(periodParam.trim());
  if (!m) return 7;

  const value = Number(m[1]);
  const unit = m[2].toLowerCase();

  if (!Number.isFinite(value) || value <= 0) return 7;

  if (unit === "d") return value;
  if (unit === "w") return value * 7;
  if (unit === "h") return Math.max(1, Math.ceil(value / 24)); // часы -> дни
  return 7;
}

function clampInt(v: any, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await requireAuthWithCompany();

    const { searchParams } = new URL(req.url);

    const periodParam = searchParams.get("period"); // "7d" / "30d" / ...
    const statusParam = searchParams.get("status"); // "all" / "done" / "new" / "error"
    const limitParam = searchParams.get("limit");   // 1..500
    const previewParam = searchParams.get("preview"); // "1" => include transcript preview
    const previewLenParam = searchParams.get("previewLen"); // 1..2000

    const days = parsePeriodToDays(periodParam);
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);

    const take = clampInt(limitParam, 1, 500, 200);
    const includePreview = previewParam === "1" || previewParam === "true";
    const previewLen = clampInt(previewLenParam, 1, 2000, 240);

    const where: any = {
      companyId,
      createdAt: { gte: since },
    };

    if (statusParam && statusParam !== "all") {
      const upper = statusParam.toUpperCase();
      if ((CallStatus as any)[upper]) {
        where.status = upper as CallStatus;
      }
    }

    const calls = await db.call.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        status: true,
        createdAt: true,
        occurredAt: true,
        duration: true,
        direction: true,
        clientPhone: true,
        linePhone: true,

        manager: {
          select: { id: true, name: true },
        },

        // ВАЖНО: score берём отсюда, а не из Call
        callScore: {
          select: {
            totalScore: true,
            summary: true,
            issues: true,
          },
        },

        // preview транскрипта (если включено)
        callTranscript: includePreview
          ? { select: { rawTranscript: true } }
          : false,
      },
    });

    const out = calls.map((c) => {
      const transcriptRaw = (c as any)?.callTranscript?.rawTranscript as string | undefined;

      return {
        id: c.id,
        status: c.status,
        createdAt: c.createdAt,
        occurredAt: (c as any).occurredAt ?? null,
        duration: (c as any).duration ?? null,
        direction: (c as any).direction ?? null,
        clientPhone: (c as any).clientPhone ?? null,
        linePhone: (c as any).linePhone ?? null,

        manager: c.manager ?? null,

        // computed score
        score: c.callScore?.totalScore ?? null,
        aiSummary: c.callScore?.summary ?? null,
        aiIssues: c.callScore?.issues ?? [],

        transcriptPreview:
          includePreview && transcriptRaw
            ? transcriptRaw.slice(0, previewLen)
            : null,
      };
    });

    return NextResponse.json({
      ok: true,
      period: { days, since: since.toISOString() },
      count: out.length,
      calls: out,
    });
  } catch (err: any) {
    const msg = String(err?.message || err);

    if (msg.startsWith("Unauthorized")) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    if (msg.includes("No companyId in session")) {
      return NextResponse.json({ ok: false, error: "No companyId in session" }, { status: 400 });
    }

    console.error("[API] /api/calls error", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load calls", details: msg },
      { status: 500 }
    );
  }
}
