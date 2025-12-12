// src/app/api/analytics/presentation/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CallStatus } from "@prisma/client";
import PptxGenJS from "pptxgenjs";

export const runtime = "nodejs";

// такой же helper, как в /api/calls
function parsePeriod(periodParam: string | null): number {
  if (!periodParam) return 30;

  const match = /^(\d+)([hdw])$/.exec(periodParam);
  if (!match) return 30;

  const value = Number(match[1]);
  const unit = match[2];

  if (!Number.isFinite(value) || value <= 0) return 30;

  switch (unit) {
    case "d":
      return value;
    case "w":
      return value * 7;
    case "h":
      return 1;
    default:
      return 30;
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const companyId = (session?.user as any)?.companyId as string | undefined;

  if (!companyId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const periodParam = searchParams.get("period") ?? "30d";
  const days = parsePeriod(periodParam);

  const since = new Date();
  since.setDate(since.getDate() - days);

  // --- 1) Базовые данные по компании
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });

  // --- 2) Общие метрики
  const [totalCalls, doneCalls, errorCalls, inProgressCalls, newCalls] =
    await Promise.all([
      db.call.count({
        where: { companyId, createdAt: { gte: since } },
      }),
      db.call.count({
        where: {
          companyId,
          createdAt: { gte: since },
          status: CallStatus.DONE,
        },
      }),
      db.call.count({
        where: {
          companyId,
          createdAt: { gte: since },
          status: CallStatus.ERROR,
        },
      }),
      db.call.count({
        where: {
          companyId,
          createdAt: { gte: since },
          status: CallStatus.PROCESSING,
        },
      }),
      db.call.count({
        where: {
          companyId,
          createdAt: { gte: since },
          status: CallStatus.NEW,
        },
      }),
    ]);

  const avgScoreAgg = await db.call.aggregate({
    where: {
      companyId,
      createdAt: { gte: since },
      status: CallStatus.DONE,
      score: { not: null },
    },
    _avg: { score: true },
  });

  const avgScore =
    avgScoreAgg._avg?.score != null
      ? Math.round(avgScoreAgg._avg.score!)
      : null;

  // --- 3) Менеджеры (топ по количеству звонков)
  const managersAggRaw = await (db.call as any).groupBy({
    by: ["managerId"],
    where: {
      companyId,
      createdAt: { gte: since },
      managerId: { not: null },
    },
    _count: { _all: true },
    _avg: { score: true },
    orderBy: { _count: { _all: "desc" } },
    take: 10,
  });

  const managersAgg = managersAggRaw as {
    managerId: string | null;
    _count: { _all: number };
    _avg: { score: number | null };
  }[];

  const managerIds: string[] = managersAgg
    .map((m) => m.managerId)
    .filter((id): id is string => !!id);

  const managers = managerIds.length
    ? await db.manager.findMany({
        where: { id: { in: managerIds } },
      })
    : [];

  const topManagers = managersAgg.map((m) => {
    const manager = managers.find((mm) => mm.id === m.managerId);
    const calls = m._count?._all ?? 0;
    const avg =
      m._avg?.score != null ? Math.round(m._avg.score!) : null;

    return {
      id: m.managerId ?? "unknown",
      name: manager?.name || "Без менеджера",
      calls,
      avgScore: avg,
    };
  });

  // --- 4) Сырые звонки для трендов и низких score
  const calls = await db.call.findMany({
    where: {
      companyId,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      status: true,
      score: true,
      duration: true,
      sentiment: true,
      manager: { select: { name: true } },
    },
  });

  // распределение по дням
  const byDate = new Map<
    string,
    { total: number; done: number; scoreSum: number; scoreCount: number }
  >();

  let lowScoreCount = 0;
  let highScoreCount = 0;

  for (const c of calls) {
    const day = c.createdAt.toISOString().slice(0, 10);

    if (!byDate.has(day)) {
      byDate.set(day, {
        total: 0,
        done: 0,
        scoreSum: 0,
        scoreCount: 0,
      });
    }

    const agg = byDate.get(day)!;
    agg.total += 1;
    if (c.status === CallStatus.DONE) {
      agg.done += 1;
    }
    if (typeof c.score === "number") {
      agg.scoreSum += c.score;
      agg.scoreCount += 1;
      if (c.score < 60) lowScoreCount += 1;
      if (c.score >= 80) highScoreCount += 1;
    }
  }

  const timeline = Array.from(byDate.entries())
    .map(([date, v]) => ({
      date,
      total: v.total,
      done: v.done,
      avgScore:
        v.scoreCount > 0 ? Math.round(v.scoreSum / v.scoreCount) : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // --- 5) Формируем презентацию (минимум 10 слайдов)

  const pptx = new PptxGenJS();

  const companyName = company?.name || "Компания";

  // Slide 1 — Титул
  {
    const slide = pptx.addSlide();
    slide.addText(`CallX · Отчёт по звонкам`, {
      x: 0.5,
      y: 0.7,
      w: 9,
      h: 1,
      fontSize: 32,
      bold: true,
    });
    slide.addText(companyName, {
      x: 0.5,
      y: 1.7,
      w: 9,
      h: 0.8,
      fontSize: 24,
    });
    slide.addText(`Период: последние ${days} дней`, {
      x: 0.5,
      y: 2.4,
      w: 9,
      h: 0.6,
      fontSize: 16,
      color: "666666",
    });
  }

  // Slide 2 — Общие цифры
  {
    const slide = pptx.addSlide();
    slide.addText("1. Общая картина по отделу", {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.7,
      fontSize: 24,
      bold: true,
    });

    const avgScoreText =
      avgScore !== null ? `${avgScore}/100` : "нет данных";

    const lines = [
      `Всего звонков: ${totalCalls}`,
      `DONE (проанализировано): ${doneCalls}`,
      `ERROR (ошибки анализа): ${errorCalls}`,
      `PROCESSING (в процессе): ${inProgressCalls}`,
      `NEW (в очереди): ${newCalls}`,
      `Средний score по отделу: ${avgScoreText}`,
    ];

    slide.addText(lines.join("\n"), {
      x: 0.8,
      y: 1.4,
      w: 8.4,
      h: 3.5,
      fontSize: 16,
      bullet: true,
      lineSpacingMultiple: 1.2,
    });
  }

  // Slide 3 — Качество речи (score)
  {
    const slide = pptx.addSlide();
    slide.addText("2. Качество разговоров (score)", {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.7,
      fontSize: 24,
      bold: true,
    });

    const scoredCallsCount = calls.filter(
      (c) => typeof c.score === "number"
    ).length;

    const lines = [
      `Кол-во звонков с присвоенным score: ${scoredCallsCount}`,
      `Средний score по отделу: ${
        avgScore !== null ? `${avgScore}/100` : "нет данных"
      }`,
      `Звонков с низким score (< 60): ${lowScoreCount}`,
      `Звонков с высоким score (≥ 80): ${highScoreCount}`,
      `Рекомендация: начать разбор с звонков < 60, затем масштабировать лучшие звонки ≥ 80 как эталон.`,
    ];

    slide.addText(lines.join("\n"), {
      x: 0.8,
      y: 1.4,
      w: 8.4,
      h: 3.5,
      fontSize: 16,
      bullet: true,
      lineSpacingMultiple: 1.2,
    });
  }

  // Slide 4 — Статусы и очередь
  {
    const slide = pptx.addSlide();
    slide.addText("3. Статусы звонков и очередь анализа", {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.7,
      fontSize: 24,
      bold: true,
    });

    const pending = newCalls + inProgressCalls;

    const lines = [
      `DONE: ${doneCalls} — звонки полностью проанализированы.`,
      `NEW: ${newCalls} — ждут постановки / обработки.`,
      `PROCESSING: ${inProgressCalls} — сейчас в обработке.`,
      `ERROR: ${errorCalls} — не удалось разобрать (битые файлы, пустая запись и т.п.).`,
      `Всего в очереди (NEW + PROCESSING): ${pending}.`,
      `Рекомендация: следить, чтобы очередь не росла и оставалась в зоне, которую команда успевает разбирать в течение дня.`,
    ];

    slide.addText(lines.join("\n"), {
      x: 0.8,
      y: 1.4,
      w: 8.4,
      h: 3.5,
      fontSize: 16,
      bullet: true,
    });
  }

  // Slide 5 — Топ менеджеров по объёму
  {
    const slide = pptx.addSlide();
    slide.addText("4. Топ менеджеров по количеству звонков", {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.7,
      fontSize: 24,
      bold: true,
    });

    const lines =
      topManagers.length === 0
        ? ["Данных по менеджерам пока нет."]
        : topManagers.map((m, index) => {
            const avg =
              m.avgScore != null ? `${m.avgScore}/100` : "нет данных";
            return `${index + 1}. ${m.name} — ${m.calls} звонков, средний score: ${avg}`;
          });

    slide.addText(lines.join("\n"), {
      x: 0.8,
      y: 1.4,
      w: 8.4,
      h: 4,
      fontSize: 16,
      bullet: true,
    });
  }

  // Slide 6 — Менеджеры: фокус по качеству
  {
    const slide = pptx.addSlide();
    slide.addText("5. Фокус по качеству менеджеров", {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.7,
      fontSize: 24,
      bold: true,
    });

    const sortedByScore = [...topManagers]
      .filter((m) => m.avgScore != null)
      .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0));

    const best = sortedByScore[0];
    const worst = sortedByScore[sortedByScore.length - 1];

    const lines: string[] = [];

    if (best) {
      lines.push(
        `Лучший по качеству: ${best.name} (avg score: ${best.avgScore}/100)`
      );
    } else {
      lines.push("Недостаточно данных для оценки качества менеджеров.");
    }

    if (worst && best && worst.id !== best.id) {
      lines.push(
        `Зона риска: ${worst.name} (avg score: ${worst.avgScore}/100)`
      );
    }

    lines.push(
      "Рекомендация: использовать лучшие звонки как эталон, а слабые — как материал для разбора и обучения."
    );

    slide.addText(lines.join("\n"), {
      x: 0.8,
      y: 1.4,
      w: 8.4,
      h: 3.5,
      fontSize: 16,
      bullet: true,
    });
  }

  // Slide 7 — Динамика по дням
  {
    const slide = pptx.addSlide();
    slide.addText("6. Динамика звонков по дням", {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.7,
      fontSize: 24,
      bold: true,
    });

    const lines =
      timeline.length === 0
        ? ["За выбранный период звонков не было или не зафиксировано в CallX."]
        : timeline.map((t) => {
            const avg =
              t.avgScore != null ? `${t.avgScore}/100` : "нет данных";
            return `${t.date}: всего ${t.total}, DONE ${t.done}, avg score: ${avg}`;
          });

    slide.addText(lines.join("\n"), {
      x: 0.8,
      y: 1.4,
      w: 8.4,
      h: 4.2,
      fontSize: 14,
      bullet: true,
    });
  }

  // Slide 8 — Проблемные зоны (низкий score / ERROR)
  {
    const slide = pptx.addSlide();
    slide.addText("7. Проблемные зоны", {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.7,
      fontSize: 24,
      bold: true,
    });

    const lines = [
      `Звонков с низким score (< 60): ${lowScoreCount}`,
      `Звонков с ошибкой анализа (ERROR): ${errorCalls}`,
      "С этими звонками стоит работать в приоритете:",
      "— разбор скрипта: приветствие, выявление потребности, работа с возражениями, закрытие;",
      "— техническая проверка проблемных записей (битое аудио, пустые файлы и т.п.).",
    ];

    slide.addText(lines.join("\n"), {
      x: 0.8,
      y: 1.4,
      w: 8.4,
      h: 3.8,
      fontSize: 16,
      bullet: true,
    });
  }

  // Slide 9 — Рекомендованный action-plan
  {
    const slide = pptx.addSlide();
    slide.addText("8. План действий по отделу", {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.7,
      fontSize: 24,
      bold: true,
    });

    const lines = [
      "1) Отобрать 5–10 лучших звонков (score ≥ 80) и собрать из них эталонный плейлист.",
      "2) Отобрать 10–20 слабых звонков (score < 60) и разобрать по этапам: где теряется клиент.",
      "3) Обновить скрипты продаж с учётом лучших формулировок и типовых возражений.",
      "4) Ввести регулярный разбор звонков: 1–2 сессии в неделю по 30–60 минут.",
      "5) Еженедельно смотреть дашборд CallX: динамику score и распределение по менеджерам.",
    ];

    slide.addText(lines.join("\n"), {
      x: 0.8,
      y: 1.4,
      w: 8.4,
      h: 4,
      fontSize: 16,
      bullet: true,
    });
  }
  // Slide 10 — Резюме
  {
    const slide = pptx.addSlide();
    slide.addText("9. Краткое резюме для руководства", {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.7,
      fontSize: 24,
      bold: true,
    });

    const lines = [
      `Отдел за период: ${totalCalls} звонков.`,
      `Проанализировано CallX (DONE): ${doneCalls}.`,
      `Средний score по отделу: ${
        avgScore !== null ? `${avgScore}/100` : "нет данных"
      }.`,
      "Точка роста: поднять долю звонков с высоким score, снизить долю слабых диалогов и ошибок анализа.",
      "CallX даёт фактуру по каждому звонку — дальше всё решает дисциплина в разборе и обучении команды.",
    ];

    slide.addText(lines.join("\n"), {
      x: 0.8,
      y: 1.4,
      w: 8.4,
      h: 3.5,
      fontSize: 16,
      bullet: true,
    });
  }

  // --- 6) Отдаём файл
  const output = await pptx.write({
    outputType: "arraybuffer",
  });

  return new NextResponse(output as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="callx_analytics_${periodParam}.pptx"`,
    },
  });
}
