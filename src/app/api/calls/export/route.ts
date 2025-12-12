// src/app/api/calls/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthWithCompany } from "@/lib/auth-guard";

/**
 * Преобразование параметра периодности: "7d", "30d", "90d", "1w" и т.д.
 */
function getFromDate(periodParam: string | null): Date {
  const now = new Date();

  if (!periodParam) {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }

  const match = /^(\d+)([hdw])$/.exec(periodParam);
  if (!match) {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }

  const value = Number(match[1]);
  const unit = match[2];

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
        days = 1;
        break;
      default:
        days = 7;
    }
  }

  const from = new Date(now);
  from.setDate(now.getDate() - days);
  return from;
}

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await requireAuthWithCompany();
    const { searchParams } = new URL(req.url);

    const period = searchParams.get("period") ?? "7d";
    const fromDate = getFromDate(period);

    // -------------------------------------------------------------------
    // 1. Получаем звонки для выгрузки
    // -------------------------------------------------------------------
    const calls = await db.call.findMany({
      where: {
        companyId,
        createdAt: { gte: fromDate },
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        manager: { select: { name: true } },
        // score: true, // УБРАЛИ: score — скалярное поле, а не relation
      },
    });

    // -------------------------------------------------------------------
    // 2. Агрегация по менеджерам
    // -------------------------------------------------------------------
    type Agg = {
      total: number;
      done: number;
      scoreSum: number;
      scoreCount: number;
      lowScoreCount: number; // < 60
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

      if (typeof c.score === "number") {
        agg.scoreSum += c.score;
        agg.scoreCount += 1;
        if (c.score < 60) agg.lowScoreCount += 1;
        if (c.score >= 80) agg.highScoreCount += 1;
      }
    }

    // Сборка строк для блока менеджеров
    const managerRows: string[][] = [];

    for (const [name, agg] of managersMap.entries()) {
      const avgScore =
        agg.scoreCount > 0 ? Math.round(agg.scoreSum / agg.scoreCount) : 0;

      const doneRate =
        agg.total > 0 ? Math.round((agg.done * 100) / agg.total) : 0;

      const lowShare =
        agg.scoreCount > 0
          ? Math.round((agg.lowScoreCount * 100) / agg.scoreCount)
          : 0;

      let advice = "Нормальный уровень, без ярких паттернов.";

      if (avgScore < 40) {
        advice =
          "Очень слабый уровень. Нужен разбор скрипта и коучинг на каждом этапе.";
      } else if (avgScore < 60) {
        advice =
          "Уровень ниже нормы. Важно усилить приветствие, выявление потребности и закрытие.";
      } else if (avgScore < 80) {
        advice =
          "Средний уровень. Работай над возражениями и структурой закрытия.";
      } else {
        advice =
          "Сильный менеджер. Используй его звонки как эталон обучения.";
      }

      if (lowShare > 40) {
        advice +=
          " Много слабых звонков — проанализируй, на каких этапах чаще ошибки.";
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
    // 3. Сырые звонки
    // -------------------------------------------------------------------
    const callsHeader = [
      "id",
      "createdAt",
      "managerName",
      "status",
      "score",
      "durationSeconds",
      "sentiment",
      "externalId",
      "transcript",
    ];

    const callRows = calls.map((c) => [
      c.id,
      c.createdAt.toISOString(),
      c.manager?.name || "Без менеджера",
      c.status,
      c.score != null ? String(c.score) : "",
      c.duration != null ? String(c.duration) : "",
      c.sentiment ?? "",
      c.externalId ?? "",
      (c.transcript ?? "").replace(/\r?\n/g, " "),
    ]);

    // -------------------------------------------------------------------
    // 4. Формирование CSV
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
      lines.push(row.join(";"));
    }

    lines.push("");
    lines.push("Raw Calls");
    lines.push(callsHeader.join(";"));

    for (const row of callRows) {
      lines.push(row.join(";"));
    }

    const csvBody = lines.join("\n");
    const csv = "\uFEFF" + csvBody;

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (msg.includes("No companyId in session")) {
      return NextResponse.json(
        { error: "No companyId in session" },
        { status: 400 }
      );
    }

    console.error("[GET /api/calls/export] error", err);
    return NextResponse.json(
      { error: err?.message || "Internal error" },
      { status: 500 }
    );
  }
}
