// src/app/api/calls/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthWithCompany } from "@/lib/auth-guard";

export const runtime = "nodejs";

/**
 * period: "7d", "30d", "90d", "1w", "48h" и т.д.
 */
function getFromDate(periodParam: string | null): Date {
  const now = new Date();

  if (!periodParam) {
    return new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  }

  const match = /^(\d+)([hdw])$/i.exec(periodParam.trim());
  if (!match) {
    return new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();

  let days = 7;

  if (Number.isFinite(value) && value > 0) {
    switch (unit) {
      case "d":
        days = value;
        break;
      case "w":
        days = value * 7;
        break;
      case "h":
        days = Math.max(1, Math.ceil(value / 24));
        break;
      default:
        days = 7;
    }
  }

  return new Date(now.getTime() - days * 24 * 3600 * 1000);
}

function csvEscape(v: any): string {
  const s = v == null ? "" : String(v);
  // Ты используешь ";" — экранируем кавычки и переносы
  const needsQuotes = s.includes(";") || s.includes('"') || s.includes("\n") || s.includes("\r");
  const escaped = s.replace(/"/g, '""').replace(/\r?\n/g, " ");
  return needsQuotes ? `"${escaped}"` : escaped;
}

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await requireAuthWithCompany();
    const { searchParams } = new URL(req.url);

    const period = searchParams.get("period") ?? "7d";
    const fromDate = getFromDate(period);

    // -------------------------------------------------------------------
    // 1) Calls for export
    // -------------------------------------------------------------------
    const calls = await db.call.findMany({
      where: {
        companyId,
        createdAt: { gte: fromDate },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        status: true,
        duration: true,
        externalId: true,

        // ВАЖНО: score здесь не берём из Call
        callScore: {
          select: {
            totalScore: true,
            // если есть в модели:
            // sentiment: true,
            // summary: true,
          },
        },

        // транскрипт — из таблицы транскриптов (правильнее)
        callTranscript: {
          select: { rawTranscript: true },
        },

        // менеджер
        manager: { select: { name: true } },

        // если в Call реально есть sentiment/transcript — можно вернуть как fallback через any ниже
      },
    });

    // -------------------------------------------------------------------
    // 2) Aggregation by manager
    // -------------------------------------------------------------------
    type Agg = {
      total: number;
      done: number;
      scoreSum: number;
      scoreCount: number;
      lowScoreCount: number;  // < 60
      highScoreCount: number; // >= 80
    };

    const managersMap = new Map<string, Agg>();

    for (const c of calls) {
      const managerName = c.manager?.name || "Без менеджера";

      if (!managersMap.has(managerName)) {
        managersMap.set(managerName, {
          total: 0,
          done: 0,
          scoreSum: 0,
          scoreCount: 0,
          lowScoreCount: 0,
          highScoreCount: 0,
        });
      }

      const agg = managersMap.get(managerName)!;
      agg.total += 1;
      if (c.status === "DONE") agg.done += 1;

      const score = c.callScore?.totalScore;
      if (typeof score === "number") {
        agg.scoreSum += score;
        agg.scoreCount += 1;
        if (score < 60) agg.lowScoreCount += 1;
        if (score >= 80) agg.highScoreCount += 1;
      }
    }

    const managerRows: string[][] = [];

    for (const [name, agg] of managersMap.entries()) {
      const avgScore = agg.scoreCount > 0 ? Math.round(agg.scoreSum / agg.scoreCount) : 0;
      const doneRate = agg.total > 0 ? Math.round((agg.done * 100) / agg.total) : 0;
      const lowShare = agg.scoreCount > 0 ? Math.round((agg.lowScoreCount * 100) / agg.scoreCount) : 0;

      let advice = "Нормальный уровень, без ярких паттернов.";

      if (avgScore < 40) {
        advice = "Очень слабый уровень. Нужен разбор скрипта и коучинг на каждом этапе.";
      } else if (avgScore < 60) {
        advice = "Уровень ниже нормы. Усиль приветствие, выявление потребности и закрытие.";
      } else if (avgScore < 80) {
        advice = "Средний уровень. Работай над возражениями и структурой закрытия.";
      } else {
        advice = "Сильный менеджер. Используй его звонки как эталон обучения.";
      }

      if (lowShare > 40) {
        advice += " Много слабых звонков — проверь, на каких этапах чаще ошибки.";
      }

      managerRows.push([
        name,
        String(agg.total),
        String(agg.done),
        String(doneRate),
        String(avgScore),
        String(agg.scoreCount),
        String(agg.lowScoreCount),
        advice,
      ]);
    }

    managerRows.sort((a, b) => Number(b[1]) - Number(a[1]));

    // -------------------------------------------------------------------
    // 3) Raw calls rows
    // -------------------------------------------------------------------
    const callsHeader = [
      "id",
      "createdAt",
      "managerName",
      "status",
      "score",
      "durationSeconds",
      "externalId",
      "transcript",
    ];

    const callRows = calls.map((c) => {
      const score = c.callScore?.totalScore;
      const transcript =
        (c.callTranscript?.rawTranscript ?? "") ||
        // fallback (если у тебя раньше было поле transcript в Call)
        String((c as any).transcript ?? "");

      return [
        c.id,
        c.createdAt.toISOString(),
        c.manager?.name || "Без менеджера",
        c.status,
        typeof score === "number" ? String(score) : "",
        c.duration != null ? String(c.duration) : "",
        c.externalId ?? "",
        transcript,
      ];
    });

    // -------------------------------------------------------------------
    // 4) CSV build
    // -------------------------------------------------------------------
    const lines: string[] = [];

    lines.push("Managers Summary");
    lines.push(
      [
        "managerName",
        "totalCalls",
        "doneCalls",
        "doneRatePercent",
        "avgScore",
        "scoredCalls",
        "lowScoreCalls",
        "advice",
      ].join(";")
    );

    for (const row of managerRows) {
      lines.push(row.map(csvEscape).join(";"));
    }

    lines.push("");
    lines.push("Raw Calls");
    lines.push(callsHeader.join(";"));

    for (const row of callRows) {
      lines.push(row.map(csvEscape).join(";"));
    }

    const csvBody = lines.join("\n");
    const csv = "\uFEFF" + csvBody; // BOM для Excel

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="callx_calls_${period}.csv"`,
      },
    });
  } catch (err: any) {
    const msg = String(err?.message || err);

    if (msg.startsWith("Unauthorized")) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    if (msg.includes("No companyId in session")) {
      return NextResponse.json({ ok: false, error: "No companyId in session" }, { status: 400 });
    }

    console.error("[GET /api/calls/export] error", err);
    return NextResponse.json(
      { ok: false, error: "Internal error", details: msg },
      { status: 500 }
    );
  }
}
