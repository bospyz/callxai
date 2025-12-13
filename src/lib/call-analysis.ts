// src/lib/call-analysis.ts

import { db } from "@/lib/db";
import { CallStatus } from "@prisma/client";
import { getOpenAIClient } from "./openai";
import { transcribeAudioFromUrl } from "./transcription";

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
  if (!transcript || !transcript.trim()) {
    return {
      score: 0,
      sentiment: "neutral",
      summary: "Транскрипт пустой. Анализ не выполнен.",
      metrics: {
        greeting: { score: 0, comment: "Нет данных." },
        reaction: { score: 0, comment: "Нет данных." },
        empathy: { score: 0, comment: "Нет данных." },
        needs: { score: 0, comment: "Нет данных." },
        presentation: { score: 0, comment: "Нет данных." },
        price: { score: 0, comment: "Нет данных." },
        objections: { score: 0, comment: "Нет данных." },
        closing: { score: 0, comment: "Нет данных." },
        clarity: { score: 0, comment: "Нет данных." },
        length: { score: 0, comment: "Нет данных." },
      },
      issues: ["Пустой транскрипт звонка."],
      managerSpeechPercent: 0,
      raw: {
        reason: "empty_transcript",
      },
    };
  }

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
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (err) {
    console.error("[call-analysis] Failed to parse JSON from OpenAI", err, raw);
    // fallback, чтобы не падать
    return {
      score: 0,
      sentiment: "neutral",
      summary: "Не удалось разобрать ответ AI, используется fallback-анализ.",
      metrics: {
        greeting: { score: 0, comment: "" },
        reaction: { score: 0, comment: "" },
        empathy: { score: 0, comment: "" },
        needs: { score: 0, comment: "" },
        presentation: { score: 0, comment: "" },
        price: { score: 0, comment: "" },
        objections: { score: 0, comment: "" },
        closing: { score: 0, comment: "" },
        clarity: { score: 0, comment: "" },
        length: { score: 0, comment: "" },
      },
      issues: ["Ошибка парсинга JSON от модели."],
      managerSpeechPercent: 0,
      raw,
    };
  }

  const score =
    typeof parsed.score === "number" &&
    parsed.score >= 0 &&
    parsed.score <= 100
      ? parsed.score
      : 0;

  const sentiment: "positive" | "neutral" | "negative" =
    parsed.sentiment === "positive" ||
    parsed.sentiment === "neutral" ||
    parsed.sentiment === "negative"
      ? parsed.sentiment
      : "neutral";

  const rawMetrics = parsed.metrics ?? {};
  const metrics: Record<MetricKey, MetricScore> = {
    greeting: rawMetrics.greeting ?? { score: 0, comment: "" },
    reaction: rawMetrics.reaction ?? { score: 0, comment: "" },
    empathy: rawMetrics.empathy ?? { score: 0, comment: "" },
    needs: rawMetrics.needs ?? { score: 0, comment: "" },
    presentation: rawMetrics.presentation ?? { score: 0, comment: "" },
    price: rawMetrics.price ?? { score: 0, comment: "" },
    objections: rawMetrics.objections ?? { score: 0, comment: "" },
    closing: rawMetrics.closing ?? { score: 0, comment: "" },
    clarity: rawMetrics.clarity ?? { score: 0, comment: "" },
    length: rawMetrics.length ?? { score: 0, comment: "" },
  };

  const managerSpeechPercent =
    typeof parsed.managerSpeechPercent === "number"
      ? parsed.managerSpeechPercent
      : 0;

  const issues: string[] = Array.isArray(parsed.issues)
    ? parsed.issues.map((x: any) => String(x))
    : [];

  const summary = typeof parsed.summary === "string" ? parsed.summary : "";

  return {
    score,
    sentiment,
    summary,
    metrics,
    issues,
    managerSpeechPercent,
    raw: parsed,
  };
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



