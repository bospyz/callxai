// src/app/api/calls/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthWithCompany } from "@/lib/auth-guard";

// period: "7d", "30d", "90d", "365d" и т.п.
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

    const calls = await db.call.findMany({
      where: {
        companyId,
        createdAt: {
          gte: fromDate,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        createdAt: true,
        status: true,
        score: true,
        duration: true,
        externalId: true,
        sentiment: true,
        transcript: true,
        manager: {
          select: {
            name: true,
          },
        },
      },
    });

    // ---------- 1) АГРЕГАЦИЯ ПО МЕНЕДЖЕРАМ ----------
    type Agg = {
      total: number;
      done: number;
      scoreSum: number;
      scoreCount: number;
      lowScoreCount: number;   // < 60
      highScoreCount: number;  // >= 80
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

      let advice = "Нормальный уровень, но без явного паттерна.";

      if (avgScore < 40) {
        advice =
          "🔥 Очень слабый уровень. Нужен разбор скрипта и личный коучинг по каждому этапу звонка.";
      } else if (avgScore < 60) {
        advice =
          "⚠️ Ниже нормы. Разбери слабые звонки, прокачай приветствие, выявление потребности и закрытие.";
      } else if (avgScore < 80) {
        advice =
          "👌 Средний уровень. Сфокусируйся на работе с возражениями и финальном закрытии, чтобы выйти на 80+.";
      } else {
        advice =
          "🏆 Сильный менеджер. Используй его звонки как эталон для обучения команды.";
      }

      if (lowShare > 40) {
        advice +=
          " Дополнительно: много звонков с низким score — разберись, на каком этапе чаще всего сливаются лиды.";
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

    managerRows.sort((a, b) => Number(b[1]) - Number(a[1])); // по total desc

    // ---------- 2) СЫРЫЕ ЗВОНКИ ----------
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

    // ---------- 3) СБОРКА CSV С ДВУМЯ БЛОКАМИ ----------
    const lines: string[] = [];

    // Блок 1 — менеджеры
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

    // разделитель между таблицами
    lines.push("");
    lines.push("Raw Calls");
    lines.push(callsHeader.join(";"));
    for (const row of callRows) {
      lines.push(row.join(";"));
    }

    const csvBody = lines.join("\n");
    // BOM для Excel + кириллица
    const csv = "\uFEFF" + csvBody;

    const fileName = `callx_calls_${period}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
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
