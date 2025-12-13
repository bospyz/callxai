// src/lib/call-analysis.ts

import { db } from "@/lib/db";
import { CallStatus } from "@prisma/client";
import { getOpenAIClient } from "./openai";
import { transcribeAudioFromUrl } from "./transcription";

/* ===== AI PARSING HELPERS ===== */

function clampInt(v: any, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampFloat(v: any, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// Extract first valid JSON object from LLM output
function extractFirstJsonObject(text: string): string | null {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function normalizeAnalysis(parsed: any): CallAnalysisResult {
  const rawMetrics = parsed?.metrics ?? {};

  const metrics: Record<MetricKey, MetricScore> = {
    greeting: { score: clampInt(rawMetrics?.greeting?.score, 0, 10, 0), comment: String(rawMetrics?.greeting?.comment ?? "") },
    reaction: { score: clampInt(rawMetrics?.reaction?.score, 0, 10, 0), comment: String(rawMetrics?.reaction?.comment ?? "") },
    empathy: { score: clampInt(rawMetrics?.empathy?.score, 0, 10, 0), comment: String(rawMetrics?.empathy?.comment ?? "") },
    needs: { score: clampInt(rawMetrics?.needs?.score, 0, 10, 0), comment: String(rawMetrics?.needs?.comment ?? "") },
    presentation: { score: clampInt(rawMetrics?.presentation?.score, 0, 10, 0), comment: String(rawMetrics?.presentation?.comment ?? "") },
    price: { score: clampInt(rawMetrics?.price?.score, 0, 10, 0), comment: String(rawMetrics?.price?.comment ?? "") },
    objections: { score: clampInt(rawMetrics?.objections?.score, 0, 10, 0), comment: String(rawMetrics?.objections?.comment ?? "") },
    closing: { score: clampInt(rawMetrics?.closing?.score, 0, 10, 0), comment: String(rawMetrics?.closing?.comment ?? "") },
    clarity: { score: clampInt(rawMetrics?.clarity?.score, 0, 10, 0), comment: String(rawMetrics?.clarity?.comment ?? "") },
    length: { score: clampInt(rawMetrics?.length?.score, 0, 10, 0), comment: String(rawMetrics?.length?.comment ?? "") },
  };

  return {
    score: clampInt(parsed?.score, 0, 100, 0),
    sentiment:
      parsed?.sentiment === "positive" || parsed?.sentiment === "negative"
        ? parsed.sentiment
        : "neutral",
    summary: typeof parsed?.summary === "string" ? parsed.summary : "",
    metrics,
    issues: Array.isArray(parsed?.issues) ? parsed.issues.map(String).slice(0, 25) : [],
    managerSpeechPercent: clampFloat(parsed?.managerSpeechPercent, 0, 100, 0),
    raw: parsed ?? {},
  };
}

/* ===== END HELPERS ===== */

const openai = getOpenAIClient();

/**
 * Метрики, которые мы считаем по звонку.
 * Можно расширять, фронт будет получать их из meta.aiMetrics.
 */
export type MetricKey =
  | "greeting"
  | "reaction"
  | "empathy"
  | "needs"
  | "presentation"
  | "price"
  | "objections"
  | "closing"
  | "clarity"
  | "length";

export type MetricScore = {
  score: number; // 0–10
  comment: string;
};

export type CallAnalysisResult = {
  score: number; // общий AI Call Score 0–100
  sentiment: "positive" | "neutral" | "negative";
  summary: string;
  metrics: Record<MetricKey, MetricScore>;
  issues: string[];
  managerSpeechPercent: number;
  raw: any; // полный JSON от модели, чтобы не потерять ничего
};

const STUB_TRANSCRIPT =
  "STUB: транскрибация аудио недоступна или файл повреждён. Это демо-текст для анализа. Реальная транскрибация будет добавлена позже, но оценка и разбор скрипта уже работают.";

/**
 * Вспомогательный анализатор транскрипта.
 * Строит полноценный JSON с метриками по этапам продаж.
 */
export async function analyzeTranscript(
  transcript: string
): Promise<CallAnalysisResult> {
  // stub-режим для dev / отсутствия ключа
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "dummy-openai-key") {
    return {
      score: 75,
      sentiment: "neutral",
      summary:
        "Тестовый (stub) анализ звонка: базовая структура диалога соблюдена, но требуется доработка работы с возражениями и ценой.",
      metrics: {
        greeting: {
          score: 7,
          comment: "Есть приветствие и представление, но без проверки удобства разговора.",
        },
        reaction: {
          score: 8,
          comment: "Менеджер отвечает достаточно быстро, без длинных пауз.",
        },
        empathy: {
          score: 6,
          comment: "Иногда поддерживает клиента, но без глубокой эмпатии.",
        },
        needs: {
          score: 7,
          comment: "Заданы базовые вопросы по потребностям, можно глубже.",
        },
        presentation: {
          score: 7,
          comment: "Проект описан, частично увязан с потребностями клиента.",
        },
        price: {
          score: 6,
          comment: "Цена озвучена, но аргументация поверхностная.",
        },
        objections: {
          score: 6,
          comment: "Возражения обработаны, но без дополнительной ценности.",
        },
        closing: {
          score: 7,
          comment: "Есть попытка закрытия на следующий шаг.",
        },
        clarity: {
          score: 8,
          comment: "Речь менеджера в целом понятная.",
        },
        length: {
          score: 7,
          comment: "Длительность звонка в адекватных пределах.",
        },
      },
      issues: ["Не до конца раскрыты потребности клиента.", "Слабая аргументация по цене."],
      managerSpeechPercent: 65,
      raw: {
        stub: true,
      },
    };
  }

  const systemPrompt = `
Ты — AI-аналитик звонков для sales-команд (недвижимость, коммерция, инвестиции).
Твоя задача — проанализировать разговор менеджера с клиентом и вернуть СТРОГО JSON.

Оцени:
- общий AI Call Score (0–100) — насколько хорошо менеджер провёл звонок
- тон клиента: sentiment ("positive" | "neutral" | "negative")
- summary — короткое резюме звонка (2–4 предложения)
- по каждой метрике 0–10 с коротким комментарием:
  greeting       — приветствие и представление
  reaction       — скорость реакции, отсутствие длинных пауз
  empathy        — эмпатия и человеческое отношение
  needs          — выявление потребностей
  presentation   — презентация решения/объекта
  price          — работа с ценой
  objections     — работа с возражениями
  closing        — закрытие на следующий шаг (встреча, показ, бронь)
  clarity        — чёткость и структурность речи менеджера
  length         — адекватность длительности звонка
- managerSpeechPercent (0–100) — доля речи менеджера от общего объёма
- issues[] — список ключевых проблем в звонке (строки)
- details (объект metricKey -> пояснение по этой метрике)

Верни ТОЛЬКО JSON такого вида (пример структуры, значения можешь менять):

{
  "score": 0,
  "sentiment": "neutral",
  "summary": "",
  "metrics": {
    "greeting":    { "score": 0, "comment": "" },
    "reaction":    { "score": 0, "comment": "" },
    "empathy":     { "score": 0, "comment": "" },
    "needs":       { "score": 0, "comment": "" },
    "presentation":{ "score": 0, "comment": "" },
    "price":       { "score": 0, "comment": "" },
    "objections":  { "score": 0, "comment": "" },
    "closing":     { "score": 0, "comment": "" },
    "clarity":     { "score": 0, "comment": "" },
    "length":      { "score": 0, "comment": "" }
  },
  "managerSpeechPercent": 0,
  "issues": [],
  "details": {}
}
`.trim();

  const completion: any = await (openai as any).chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: transcript.slice(0, 15000),
      },
    ],
  });

  const raw = completion?.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error("Empty response from OpenAI when analyzing transcript");
  }

    let parsed: any;
  try {
    if (typeof raw === "string") {
      const extracted = extractFirstJsonObject(raw) ?? raw;
      parsed = JSON.parse(extracted);
    } else {
      parsed = raw;
    }
  } catch (err) {
    console.error("[call-analysis] Failed to parse JSON from OpenAI", err, raw);
    return normalizeAnalysis({
      score: 0,
      sentiment: "neutral",
      summary: "Не удалось разобрать ответ AI, используется fallback-анализ.",
      metrics: {},
      issues: ["Ошибка парсинга JSON от модели."],
      managerSpeechPercent: 0,
      raw,
    });
  }

  return normalizeAnalysis(parsed);
}

/**
 * Основная функция обработки одного звонка.
 * 1) достаём звонок из БД
 * 2) если нет транскрипта, но есть audioUrl / audioUrlExternal — пробуем транскрибацию
 * 3) если всё ещё нет транскрипта — используем STUB
 * 4) анализируем текст и обновляем запись
 */
export async function processCall(callId: string) {
  const call = await db.call.findUnique({
    where: { id: callId },
  });
if (!call) {
    throw new Error(`Call ${callId} 
  // QUALITY GATE: duration (skip too short calls to save cost and reduce noise)
  if (!call.duration || call.duration < 15) {
    await db.call.update({
      where: { id: call.id },
      data: {
        status: CallStatus.DONE,
        meta: {
          ...(call.meta as any),
          skipped: true,
          reason: "call_too_short",
          duration: call.duration ?? null,
        },
      },
    });
return;
  }
not found`);
  }

  let transcript = call.transcript ?? "";

  // 1) Если нет транскрипта, но есть audioUrl / audioUrlExternal — пробуем реальную транскрибацию
  if (!transcript) {
    const audioUrl =
      call.audioUrl || (call as any).audioUrlExternal || null;

    if (audioUrl) {
      try {
        transcript = await transcribeAudioFromUrl(audioUrl);
      
        if (!transcript || !transcript.trim()) {
          await db.call.update({
            where: { id: callId },
            data: {
              status: CallStatus.DONE,
              meta: {
                ...(call.meta as any),
                skipped: true,
                reason: "empty_transcript",
              },
            },
          });
return;
        }
} catch (err) {
        console.error("[processCall] transcription error", err);
        // НЕ ставим ERROR-статус, просто логируем в meta
        await db.call.update({
          where: { id: callId },
          data: {
            meta: {
              ...(call.meta as any),
              transcriptionError: String(err),
            },
          },
        });
}
    }
  }

  // 2) Если всё ещё нет текста — fallback на STUB
  if (!transcript) {
    transcript = STUB_TRANSCRIPT;
  }

  // 3) Анализ текста звонка
  const analysis = await analyzeTranscript(transcript);

  
  // Persist structured tables (for future analytics & UI)
  await db.callTranscript.upsert({
    where: { callId: call.id },
    create: { callId: call.id, rawTranscript: transcript },
    update: { rawTranscript: transcript },
  });

  await db.callScore.upsert({
    where: { callId: call.id },
    create: {
      callId: call.id,
      totalScore: analysis.score,
      greetingScore: analysis.metrics.greeting.score,
      reactionScore: analysis.metrics.reaction.score,
      empathyScore: analysis.metrics.empathy.score,
      needsScore: analysis.metrics.needs.score,
      presentationScore: analysis.metrics.presentation.score,
      priceScore: analysis.metrics.price.score,
      objectionsScore: analysis.metrics.objections.score,
      closingScore: analysis.metrics.closing.score,
      clarityScore: analysis.metrics.clarity.score,
      lengthScore: analysis.metrics.length.score,
      talkRatioManager: analysis.managerSpeechPercent,
      summary: analysis.summary,
      issues: analysis.issues,
      details: analysis.metrics,
    },
    update: {
      totalScore: analysis.score,
      greetingScore: analysis.metrics.greeting.score,
      reactionScore: analysis.metrics.reaction.score,
      empathyScore: analysis.metrics.empathy.score,
      needsScore: analysis.metrics.needs.score,
      presentationScore: analysis.metrics.presentation.score,
      priceScore: analysis.metrics.price.score,
      objectionsScore: analysis.metrics.objections.score,
      closingScore: analysis.metrics.closing.score,
      clarityScore: analysis.metrics.clarity.score,
      lengthScore: analysis.metrics.length.score,
      talkRatioManager: analysis.managerSpeechPercent,
      summary: analysis.summary,
      issues: analysis.issues,
      details: analysis.metrics,
    },
  });
await db.call.update({
    where: { id: callId },
    data: {
      status: CallStatus.DONE,
      transcript,
      score: analysis.score,
      sentiment: analysis.sentiment,
      meta: {
        ...(call.meta as any),
        aiSummary: analysis.summary,
        aiIssues: analysis.issues,
        aiMetrics: analysis.metrics,
        managerSpeechPercent: analysis.managerSpeechPercent,
        aiRaw: analysis.raw,
      },
    },
  });
}










