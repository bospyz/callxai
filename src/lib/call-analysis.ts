import { db } from "./db";
import { CallStatus } from "@prisma/client";
import { getOpenAIClient } from "./openai";

const openai = getOpenAIClient();

type CallAnalysisResult = {
  score: number;
  sentiment: "positive" | "neutral" | "negative";
  meta: Record<string, unknown>;
};

const STUB_TRANSCRIPT =
  "STUB: транскрибация пока не подключена. Это демо-текст для анализа звонка. Реальная расшифровка аудио будет добавлена позже, но оценка и разбор скрипта уже работают.";

export async function analyzeTranscript(
  transcript: string
): Promise<CallAnalysisResult> {
  if (!transcript || !transcript.trim()) {
    return {
      score: 0,
      sentiment: "neutral",
      meta: {
        reason: "empty_transcript",
      },
    };
  }

  const prompt = `
Ты AI-аналитик звонков для sales-команд. Твоя задача  оценить разговор менеджера с клиентом.

Ниже транскрипт звонка (на русском или казахском). Твоя задача  вернуть СТРОГО один JSON без лишнего текста с полями:
- score: целое число от 0 до 100 (качество работы менеджера)
- sentiment: "positive" | "neutral" | "negative"
- script_stages: объект с булевыми полями:
  - greeting
  - need_identification
  - offer_presentation
  - objections_handling
  - closing_attempt
- insights: массив коротких строк с ключевыми выводами (25 штук)
- recommendations: массив коротких советов для менеджера (25 штук)

Ответ будь ТОЛЬКО в формате JSON.

Транскрипт:
"""${transcript}"""
`.trim();

  const completion: any = await (openai as any).chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Ты аналитик продаж. Говори кратко и строго в JSON. Не добавляй никакого пояснительного текста.",
      },
      {
        role: "user",
        content: prompt,
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
    throw new Error("Failed to parse JSON from OpenAI response");
  }

  const score =
    typeof parsed.score === "number" && parsed.score >= 0 && parsed.score <= 100
      ? parsed.score
      : 0;

  const sentiment: "positive" | "neutral" | "negative" =
    parsed.sentiment === "positive" ||
    parsed.sentiment === "neutral" ||
    parsed.sentiment === "negative"
      ? parsed.sentiment
      : "neutral";

  return {
    score,
    sentiment,
    meta: parsed,
  };
}

/**
 * Основная функция обработки одного звонка.
 * 1) достаём звонок из БД
 * 2) берём транскрипт (если нет  используем STUB_TRANSCRIPT)
 * 3) прогоняем через LLM-анализ
 * 4) сохраняем результат в БД
 */
export async function processCall(callId: string): Promise<void> {
  const call = await db.call.findUnique({
    where: { id: callId },
  });

  if (!call) {
    throw new Error(`Call not found: ${callId}`);
  }

  // никакой зависимости от audioUrl  работаем даже без него
  const transcript =
    call.transcript && call.transcript.trim().length > 0
      ? call.transcript
      : STUB_TRANSCRIPT;

  // помечаем звонок как PROCESSING, чтобы не схватить его повторно
  if (call.status !== CallStatus.PROCESSING) {
    await db.call.update({
      where: { id: callId },
      data: {
        status: CallStatus.PROCESSING,
      },
    });
  }

  const analysis = await analyzeTranscript(transcript);

  await db.call.update({
    where: { id: callId },
    data: {
      status: CallStatus.DONE,
      transcript,
      score: analysis.score,
      sentiment: analysis.sentiment,
      meta: analysis.meta as any,
    },
  });
}
