import { db } from "./db";
import { getOpenAIClient } from "./openai";
import { CallStatus } from "@prisma/client";

const openai = getOpenAIClient() as any;

type CallAnalysisResult = {
  score: number;
  sentiment: string;
  meta: Record<string, unknown>;
};

//  ВРЕМЕННАЯ транскрибация  без реального аудио
async function transcribeAudioFromUrl(audioUrl: string | null | undefined): Promise<string> {
  return "STUB: транскрибация отключена. Это демо-текст для анализа звонка. Реальная расшифровка аудио будет подключена позже.";
}

async function analyzeTranscript(transcript: string): Promise<CallAnalysisResult> {
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
- insights: массив коротких строк с ключевыми выводами (2-5 штук)
- recommendations: массив коротких советов для менеджера (2-5 штук)

Ответ будь ТОЛЬКО в формате JSON.

Транскрипт:
"""${transcript}"""
`.trim();

  const completion = await (openai as any).chat.completions.create({
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

  const score = typeof parsed.score === "number" ? parsed.score : 0;
  const sentiment = typeof parsed.sentiment === "string" ? parsed.sentiment : "neutral";

  return {
    score,
    sentiment,
    meta: parsed,
  };
}

/**
 * Основная функция обработки одного звонка:
 * 1) достаём звонок
 * 2) ставим PROCESSING
 * 3) делаем "транскрипт" (stub)
 * 4) анализируем
 * 5) сохраняем DONE + поля
 */
export async function processCall(callId: string): Promise<void> {
  const call = await db.call.findUnique({
    where: { id: callId },
  });

  if (!call) {
    throw new Error(`Call not found: ${callId}`);
  }

  // уже обработан  ничего не делаем
  if (call.status === CallStatus.DONE) {
    return;
  }

  // помечаем как PROCESSING
  if (call.status !== CallStatus.PROCESSING) {
    await db.call.update({
      where: { id: callId },
      data: {
        status: CallStatus.PROCESSING,
      },
    });
  }

  const transcript = await transcribeAudioFromUrl(call.audioUrl);
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
