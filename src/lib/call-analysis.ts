import { db } from "./db";
import { getOpenAIClient } from "./openai";

const openai = getOpenAIClient();
import { CallStatus } from "@prisma/client";

const ALLOWED_AUDIO_HOSTS = [
  "amocrm.ru",
  "amocrm.com",
  "cdn.amocrm.ru",
  // добавь свои домены (S3/CDN), если будешь хранить аудио сам
];

function isAllowedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return ALLOWED_AUDIO_HOSTS.some((host) => u.hostname.endsWith(host));
  } catch {
    return false;
  }
}

export async function transcribeFromUrl(url: string): Promise<string> {
  if (!isAllowedUrl(url)) {
    throw new Error("Invalid or disallowed audio URL");
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download audio: ${res.status} ${res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const transcript = await openai.audio.transcriptions.create({
    // openai SDK умеет работать с Buffer
    file: buffer as any,
    model: "gpt-4o-mini-transcribe", // или whisper-1 / другая модель
    response_format: "text",
  });

  return transcript as unknown as string;
}

type AnalysisResult = {
  score: number;
  sentiment: string;
  strengths: string[];
  weaknesses: string[];
  meta: any;
};

export async function analyzeTranscript(text: string): Promise<AnalysisResult> {
  if (!text.trim()) {
    return {
      score: 0,
      sentiment: "neutral",
      strengths: [],
      weaknesses: [],
      meta: {
        verdict: "no_audio",
        reason: "empty_transcript",
      },
    };
  }

  const systemPrompt =
    "Ты строгий, но конструктивный руководитель отдела продаж. " +
    "Анализируешь транскрипт звонка менеджера с клиентом и отвечаешь ТОЛЬКО JSON-ом. " +
    "JSON-объект должен содержать поля: " +
    "score (число от 0 до 100), " +
    "sentiment ('positive' | 'neutral' | 'negative'), " +
    "strengths (массив строк), " +
    "weaknesses (массив строк), " +
    "meta (любой объект с деталями анализа, этапами, упоминаниями скрипта и т.п.).";

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0].message.content || "{}";

  let parsed: any;
  try {
    parsed = JSON.parse(raw as string);
  } catch {
    parsed = {};
  }

  const score =
    typeof parsed.score === "number"
      ? Math.max(0, Math.min(100, parsed.score))
      : 0;

  const sentiment =
    typeof parsed.sentiment === "string" ? parsed.sentiment : "neutral";

  const strengths = Array.isArray(parsed.strengths)
    ? parsed.strengths.map((s: any) => String(s))
    : [];

  const weaknesses = Array.isArray(parsed.weaknesses)
    ? parsed.weaknesses.map((w: any) => String(w))
    : [];

  const meta = parsed.meta ?? parsed;

  return {
    score,
    sentiment,
    strengths,
    weaknesses,
    meta,
  };
}

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

  const transcript = await transcribeFromUrl(call.audioUrl);
  const analysis = await analyzeTranscript(transcript);

  await db.call.update({
    where: { id: callId },
    data: {
      status: CallStatus.DONE,
      transcript,
      score: analysis.score,
      sentiment: analysis.sentiment,
      meta: analysis.meta,
    },
  });
}
