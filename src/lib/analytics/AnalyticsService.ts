import { db } from "@/lib/db";
import { CallStatus } from "@prisma/client";

type SummaryResponse = {
  kpi: {
    totalCalls: number;
    doneCalls: number;
    inQueue: number;
    processingCalls: number;
    newCalls: number;
    errorCalls: number;
    errorRate: number;
    scoredCallsCount: number;
    lowScoreCount: number;
    midScoreCount: number;
    highScoreCount: number;
    avgScore: number | null;
  };
  sentiment: { positive: number; neutral: number; negative: number };
  topManagers: { id: string; name: string; calls: number; avgScore: number | null }[];
  daily: { day: string; total: number; done: number }[];
  deep: {
    avgMetrics: Record<string, number | null>; // 0–10
    avgManagerSpeechPercent: number | null;   // 0–100
    topIssues: { text: string; count: number }[];
    sampleSize: number;
  };
  // “как Excel” — таблица по каждому менеджеру
  managerTable: Array<{
    managerId: string;
    name: string;
    callsTotal: number;
    callsDone: number;
    avgScore100: number | null;

    greetingAvg10: number | null;
    needsAvg10: number | null;
    presentationAvg10: number | null;
    objectionsAvg10: number | null;
    closingAvg10: number | null;

    managerSpeechAvg: number | null;
    errorCalls: number;
  }>;
};

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function safeNum(v: any): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function pushIssue(map: Map<string, number>, text: string) {
  const t = (text ?? "").trim();
  if (!t) return;
  map.set(t, (map.get(t) ?? 0) + 1);
}

export async function getAnalyticsSummary(companyId: string, days: number): Promise<SummaryResponse> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  // Берём минимум нужных полей + manager + callScore (если есть)
  const calls = await db.call.findMany({
    where: { companyId, createdAt: { gte: since } },
    select: {
      id: true,
      createdAt: true,
      status: true,
      score: true,           // старый скоринг 0-100
      meta: true,            // JSON (sentiment/aiIssues/aiMetrics/managerSpeechPercent)
      managerId: true,
      manager: { select: { id: true, name: true } },

      // новый скоринг (если внедрён)
      callScore: {
        select: {
          totalScore: true,         // 0-100
          greetingScore: true,      // 0-10
          needsScore: true,         // 0-10
          presentationScore: true,  // 0-10
          objectionsScore: true,    // 0-10
          closingScore: true,       // 0-10
          talkRatioManager: true,   // 0-100
          issues: true,             // Json
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const totalCalls = calls.length;

  let doneCalls = 0;
  let errorCalls = 0;
  let newCalls = 0;
  let processingCalls = 0;

  // score 0-100
  let scoreSum = 0;
  let scoredCallsCount = 0;
  let lowScoreCount = 0;
  let midScoreCount = 0;
  let highScoreCount = 0;

  // sentiment
  let pos = 0, neu = 0, neg = 0;

  // daily
  const dailyMap = new Map<string, { day: string; total: number; done: number }>();

  // top issues
  const issuesMap = new Map<string, number>();

  // deep metrics averages (0–10)
  const metricSum: Record<string, number> = {};
  const metricCnt: Record<string, number> = {};
  let managerSpeechSum = 0;
  let managerSpeechCnt = 0;
  let deepSampleSize = 0;

  // per manager (“excel table”)
  const mgrMap = new Map<
    string,
    {
      name: string;
      callsTotal: number;
      callsDone: number;
      errorCalls: number;

      scoreSum100: number;
      scoreCnt100: number;

      greetingSum10: number; greetingCnt10: number;
      needsSum10: number; needsCnt10: number;
      presentationSum10: number; presentationCnt10: number;
      objectionsSum10: number; objectionsCnt10: number;
      closingSum10: number; closingCnt10: number;

      speechSum: number; speechCnt: number;
    }
  >();

  for (const c of calls) {
    // statuses
    if (c.status === CallStatus.DONE) doneCalls++;
    if (c.status === CallStatus.ERROR) errorCalls++;
    if (c.status === CallStatus.NEW) newCalls++;
    if (c.status === CallStatus.PROCESSING) processingCalls++;

    // daily
    const k = dayKey(c.createdAt);
    if (!dailyMap.has(k)) dailyMap.set(k, { day: k, total: 0, done: 0 });
    const d = dailyMap.get(k)!;
    d.total += 1;
    if (c.status === CallStatus.DONE) d.done += 1;

    // score 0–100: приоритет callScore.totalScore, иначе call.score
    const score100 = safeNum(c.callScore?.totalScore) ?? safeNum(c.score);
    if (score100 != null) {
      scoredCallsCount++;
      scoreSum += score100;
      if (score100 < 60) lowScoreCount++;
      else if (score100 < 80) midScoreCount++;
      else highScoreCount++;
    }

    // sentiment из meta.sentiment (если есть)
    const meta: any = c.meta ?? {};
    const s = meta?.sentiment;
    if (s === "positive") pos++;
    else if (s === "negative") neg++;
    else if (s === "neutral") neu++;

    // issues: приоритет callScore.issues, иначе meta.aiIssues (массив строк)
    const issues = c.callScore?.issues ?? meta?.aiIssues;
    if (Array.isArray(issues)) {
      for (const it of issues) pushIssue(issuesMap, typeof it === "string" ? it : it?.text);
    } else if (issues && typeof issues === "object") {
      // если Json в виде [{text,count}] или {text:count}
      if (Array.isArray((issues as any).items)) {
        for (const it of (issues as any).items) pushIssue(issuesMap, it?.text);
      } else {
        for (const [key, val] of Object.entries(issues)) {
          if (typeof val === "number") issuesMap.set(key, (issuesMap.get(key) ?? 0) + val);
        }
      }
    }

    // deep metrics — считаем только по DONE (чтобы “как Excel” было честно)
    if (c.status === CallStatus.DONE) {
      deepSampleSize++;

      // метрики 0–10: приоритет callScore.*, иначе meta.aiMetrics
      const aiMetrics = meta?.aiMetrics ?? {};
      const metricPairs: Array<[string, number | null]> = [
        ["greeting", safeNum(c.callScore?.greetingScore) ?? safeNum(aiMetrics?.greeting)],
        ["needs", safeNum(c.callScore?.needsScore) ?? safeNum(aiMetrics?.needs)],
        ["presentation", safeNum(c.callScore?.presentationScore) ?? safeNum(aiMetrics?.presentation)],
        ["objections", safeNum(c.callScore?.objectionsScore) ?? safeNum(aiMetrics?.objections)],
        ["closing", safeNum(c.callScore?.closingScore) ?? safeNum(aiMetrics?.closing)],
        // можно расширять: empathy/clarity/reaction/length если есть в meta
        ["empathy", safeNum(aiMetrics?.empathy)],
        ["clarity", safeNum(aiMetrics?.clarity)],
        ["reaction", safeNum(aiMetrics?.reaction)],
        ["length", safeNum(aiMetrics?.length)],
        ["price", safeNum(aiMetrics?.price)],
      ];

      for (const [key, val] of metricPairs) {
        if (val == null) continue;
        metricSum[key] = (metricSum[key] ?? 0) + val;
        metricCnt[key] = (metricCnt[key] ?? 0) + 1;
      }

      const speech = safeNum(c.callScore?.talkRatioManager) ?? safeNum(meta?.managerSpeechPercent);
      if (speech != null) {
        managerSpeechSum += speech;
        managerSpeechCnt++;
      }
    }

    // manager aggregation
    const managerId = c.managerId ?? "NO_MANAGER";
    const managerName = c.manager?.name ?? meta?.managerName ?? "Без менеджера";

    if (!mgrMap.has(managerId)) {
      mgrMap.set(managerId, {
        name: managerName,
        callsTotal: 0,
        callsDone: 0,
        errorCalls: 0,
        scoreSum100: 0,
        scoreCnt100: 0,

        greetingSum10: 0, greetingCnt10: 0,
        needsSum10: 0, needsCnt10: 0,
        presentationSum10: 0, presentationCnt10: 0,
        objectionsSum10: 0, objectionsCnt10: 0,
        closingSum10: 0, closingCnt10: 0,

        speechSum: 0, speechCnt: 0,
      });
    }

    const m = mgrMap.get(managerId)!;
    m.callsTotal++;
    if (c.status === CallStatus.DONE) m.callsDone++;
    if (c.status === CallStatus.ERROR) m.errorCalls++;

    if (score100 != null) {
      m.scoreSum100 += score100;
      m.scoreCnt100++;
    }

    // 0-10 manager metrics (DONE only — логично)
    if (c.status === CallStatus.DONE) {
      const metaMetrics = (c.meta as any)?.aiMetrics ?? {};
      const g10 = safeNum(c.callScore?.greetingScore) ?? safeNum(metaMetrics?.greeting);
      const n10 = safeNum(c.callScore?.needsScore) ?? safeNum(metaMetrics?.needs);
      const p10 = safeNum(c.callScore?.presentationScore) ?? safeNum(metaMetrics?.presentation);
      const o10 = safeNum(c.callScore?.objectionsScore) ?? safeNum(metaMetrics?.objections);
      const c10 = safeNum(c.callScore?.closingScore) ?? safeNum(metaMetrics?.closing);

      if (g10 != null) { m.greetingSum10 += g10; m.greetingCnt10++; }
      if (n10 != null) { m.needsSum10 += n10; m.needsCnt10++; }
      if (p10 != null) { m.presentationSum10 += p10; m.presentationCnt10++; }
      if (o10 != null) { m.objectionsSum10 += o10; m.objectionsCnt10++; }
      if (c10 != null) { m.closingSum10 += c10; m.closingCnt10++; }

      const speech = safeNum(c.callScore?.talkRatioManager) ?? safeNum((c.meta as any)?.managerSpeechPercent);
      if (speech != null) { m.speechSum += speech; m.speechCnt++; }
    }
  }

  const avgScore = scoredCallsCount > 0 ? Math.round((scoreSum / scoredCallsCount) * 10) / 10 : null;
  const inQueue = newCalls + processingCalls;
  const errorRate = totalCalls > 0 ? Math.round((errorCalls * 100) / totalCalls) : 0;

  const daily = Array.from(dailyMap.values());

  const avgMetrics: Record<string, number | null> = {};
  for (const key of Object.keys(metricSum)) {
    const cnt = metricCnt[key] ?? 0;
    avgMetrics[key] = cnt > 0 ? Math.round(((metricSum[key] / cnt) * 10)) / 10 : null;
  }

  const avgManagerSpeechPercent =
    managerSpeechCnt > 0 ? Math.round((managerSpeechSum / managerSpeechCnt) * 10) / 10 : null;

  const topIssues = Array.from(issuesMap.entries())
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // top managers by volume
  const topManagers = Array.from(mgrMap.entries())
    .map(([id, v]) => ({
      id,
      name: v.name,
      calls: v.callsTotal,
      avgScore: v.scoreCnt100 > 0 ? Math.round((v.scoreSum100 / v.scoreCnt100) * 10) / 10 : null,
    }))
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 10);

  // excel manager table
  const managerTable = Array.from(mgrMap.entries())
    .map(([managerId, v]) => ({
      managerId,
      name: v.name,
      callsTotal: v.callsTotal,
      callsDone: v.callsDone,
      avgScore100: v.scoreCnt100 > 0 ? Math.round((v.scoreSum100 / v.scoreCnt100) * 10) / 10 : null,

      greetingAvg10: v.greetingCnt10 > 0 ? Math.round((v.greetingSum10 / v.greetingCnt10) * 10) / 10 : null,
      needsAvg10: v.needsCnt10 > 0 ? Math.round((v.needsSum10 / v.needsCnt10) * 10) / 10 : null,
      presentationAvg10: v.presentationCnt10 > 0 ? Math.round((v.presentationSum10 / v.presentationCnt10) * 10) / 10 : null,
      objectionsAvg10: v.objectionsCnt10 > 0 ? Math.round((v.objectionsSum10 / v.objectionsCnt10) * 10) / 10 : null,
      closingAvg10: v.closingCnt10 > 0 ? Math.round((v.closingSum10 / v.closingCnt10) * 10) / 10 : null,

      managerSpeechAvg: v.speechCnt > 0 ? Math.round((v.speechSum / v.speechCnt) * 10) / 10 : null,
      errorCalls: v.errorCalls,
    }))
    .sort((a, b) => b.callsTotal - a.callsTotal);

  // sentiment totals
  const sentiment = { positive: pos, neutral: neu, negative: neg };

  return {
    kpi: {
      totalCalls,
      doneCalls,
      inQueue,
      processingCalls,
      newCalls,
      errorCalls,
      errorRate,
      scoredCallsCount,
      lowScoreCount,
      midScoreCount,
      highScoreCount,
      avgScore,
    },
    sentiment,
    topManagers,
    daily,
    deep: {
      avgMetrics,
      avgManagerSpeechPercent,
      topIssues,
      sampleSize: deepSampleSize,
    },
    managerTable,
  };
}
