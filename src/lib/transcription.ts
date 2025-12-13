import { setTimeout as delay } from "timers/promises";

const MAX_AUDIO_BYTES = 50 * 1024 * 1024; // 50 MB
const FETCH_TIMEOUT_MS = 30_000;

const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./,
  /^0\./,
  /^localhost$/i,
];

function isPrivateHost(hostname: string): boolean {
  return PRIVATE_IP_RANGES.some((re) => re.test(hostname));
}

function validateAudioUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid audio URL");
  }

  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS audio URLs are allowed");
  }

  if (!url.hostname || isPrivateHost(url.hostname)) {
    throw new Error("Blocked private or local audio URL");
  }

  return url;
}

export async function transcribeAudioFromUrl(audioUrl: string): Promise<string> {
  const url = validateAudioUrl(audioUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: "error",
    });
  } catch (err: any) {
    throw new Error(`Audio download failed: ${err?.name || err}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`Audio download HTTP ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.startsWith("audio/") && !contentType.includes("octet-stream")) {
    throw new Error(`Unsupported content-type: ${contentType}`);
  }

  const contentLength = res.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_AUDIO_BYTES) {
    throw new Error("Audio file too large");
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("Audio body is not readable");
  }

  let received = 0;
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    if (!value) continue;
    received += value.length;

    if (received > MAX_AUDIO_BYTES) {
      throw new Error("Audio file exceeds size limit");
    }

    chunks.push(value);
  }

  const audioBuffer = Buffer.concat(chunks);

  //  Сейчас реального ASR тут нет  возвращаем stub.
  // Это ОК: твой analyzeTranscript умеет работать со stub-режимом.
  // Когда подключишь Whisper / ASR  сюда вставится вызов.
  return "[TRANSCRIPTION_PENDING] audio downloaded safely, ASR not yet connected";
}
