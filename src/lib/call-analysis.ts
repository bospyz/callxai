import { db } from "@/lib/db";
import { CallStatus } from "@prisma/client";
import { getOpenAIClient } from "./openai";
import { transcribeAudioFromUrl } from "./transcription";

const openai = getOpenAIClient();

type CallAnalysisResult = {
  score: number;
  sentiment: "positive" | "neutral" | "negative";
  meta: Record<string, unknown>;
};

const STUB_TRANSCRIPT =
  "STUB: транскрибация аудио недоступна или файл повреждён. Это демо-текст для анализа. Реальная транскрибация будет добавлена позже, но оценка и разбор скрипта уже работают.";

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
- insights: массив коротких строк с ключевыми выводами (до 25 штук)
- recommendations: массив коротких советов для менеджера (до 25 штук)

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
  } catch {
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
 * 2) если нет транскрипта, но есть audioUrl  пробуем транскрибацию
 *    (при ошибке просто логируем и идём дальше)
 * 3) если всё ещё нет транскрипта  используем STUB
 * 4) анализируем текст и обновляем запись
 */
export async function processCall(callId: string) {
  const call = await db.call.findUnique({
    where: { id: callId },
  });

  if (!call) {
    throw new Error(`Call ${callId} not found`);
  }

  let transcript = call.transcript ?? "";

  // 1) Если нет транскрипта, но есть audioUrl  пробуем реальную транскрибацию
  if (!transcript && call.audioUrl) {
    try {
      transcript = await transcribeAudioFromUrl(call.audioUrl);
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

  // 2) Если всё ещё нет текста  fallback на STUB
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
      meta: analysis.meta as any,
    },
  });
}
