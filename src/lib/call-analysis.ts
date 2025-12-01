import { db } from "./db";
import { getOpenAIClient } from "./openai";
import { CallStatus } from "@prisma/client";
import OpenAI from "openai";

const openai = getOpenAIClient() as any;

const STUB_MODE = process.env.AMO_STUB_MODE === "true";
const ALLOW_ANY_AUDIO = process.env.ALLOW_ANY_AUDIO === "true";

const ALLOWED_AUDIO_HOSTS = [
  "amocrm.ru",
  "amocrm.com",
  "cdn.amocrm.ru",
  // добавь свои домены (S3/CDN), если будешь хранить аудио сам
];

type CallAnalysisResult = {
  score: number;
  sentiment: string;
  meta: Record<string, unknown>;
};

function isHostAllowed(url: string): boolean {
  if (ALLOW_ANY_AUDIO) return true;
  try {
    const parsed = new URL(url);
    return ALLOWED_AUDIO_HOSTS.some((host) => parsed.hostname.endsWith(host));
  } catch {
    return false;
  }
}

async function transcribeAudioFromUrl(audioUrl: string): Promise<string> {
  if (STUB_MODE) {
    return "Транскрибация отключена (STUB_MODE). Это тестовый текст для демо аналитики звонка.";
  }

  if (!isHostAllowed(audioUrl)) {
    throw new Error("Audio host is not allowed. Проверь ALLOW_ANY_AUDIO или ALLOWED_AUDIO_HOSTS.");
  }

  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);

  // OpenAI SDK helper: превращаем буфер в "файл"
  const file = await (OpenAI as any).toFile(uint8, "call-audio.webm");

  const transcription = await (openai as any).audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
    response_format: "text",
    language: "ru",
  });

  if (typeof transcription === "string") {
    return transcription;
  }

  if (transcription && typeof (transcription as any).text === "string") {
    return (transcription as any).text as string;
  }

  throw new Error("Unexpected transcription response from OpenAI");
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
Ты  AI-аналитик звонков для sales-команд. Твоя задача  оценить разговор менеджера с клиентом.

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
          "Ты  аналитик продаж. Говори кратко и строго в JSON. Не добавляй никакого пояснительного текста.",
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
 * Основная функция обработки одного звонка.
 * 1) достаём звонок из БД
 * 2) тянем и транскрибируем аудио
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

  if (!call.audioUrl) {
    throw new Error(`Call ${callId} has no audioUrl`);
  }

  // помечаем звонок как PROCESSING, чтобы не схватить его повторно
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
