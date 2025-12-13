// src/lib/transcription.ts
import { getOpenAIClient } from "@/lib/openai";
import { toFile } from "openai/uploads";

import dns from "node:dns/promises";
import net from "node:net";

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, ::1, fc00::/7, fe80::/10
function isPrivateIp(ip: string): boolean {
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split(".").map((x) => Number(x));
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true; // link-local
    return false;
  }
  if (net.isIP(ip) === 6) {
    const norm = ip.toLowerCase();
    if (norm === "::1") return true;
    if (norm.startsWith("fc") || norm.startsWith("fd")) return true; // ULA
    if (norm.startsWith("fe80")) return true; // link-local
    return false;
  }
  return true; // unknown => treat as unsafe
}

async function assertNoPrivateNetwork(u: URL) {
  const host = u.hostname.toLowerCase();

  // прямые локальные хосты режем сразу
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new Error("SSRF blocked: localhost is not allowed");
  }

  // если это IP в URL — проверяем напрямую
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("SSRF blocked: private IP is not allowed");
    return;
  }

  // DNS resolve -> IPs -> проверка всех
  const res = await dns.lookup(host, { all: true, verbatim: true });
  for (const r of res) {
    if (isPrivateIp(r.address)) {
      throw new Error("SSRF blocked: resolves to private IP");
    }
  }
}

export async function transcribeAudioFromUrl(audioUrl: string): Promise<string> {
  if (!audioUrl || !isValidHttpUrl(audioUrl)) {
    throw new Error("Invalid audioUrl for transcription");
  }

  const u = new URL(audioUrl);
  await assertNoPrivateNetwork(u);

  // лимиты (можно вынести в env)
  const MAX_BYTES = 25 * 1024 * 1024; // 25MB
  const TIMEOUT_MS = 20000;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(audioUrl, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        // чтобы CDN/телефонии чаще отдавали нормальный контент
        "User-Agent": "CallXAI-Transcriber/1.0",
        Accept: "audio/*,application/octet-stream,*/*",
      },
    });
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    throw new Error(`Failed to download audio for transcription: ${res.status} ${res.statusText}`);
  }

  // Контент-тайп мягко проверяем (не все сервисы ставят корректно)
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const looksAudio = ct.startsWith("audio/") || ct.includes("octet-stream") || ct.includes("mpeg") || ct.includes("mp4");
  if (!looksAudio) {
    // не делаем fatal, но лучше зафейлить, чтобы не тратить OpenAI на HTML
    throw new Error(`Unexpected content-type for audio: ${ct || "unknown"}`);
  }

  // Если сервер отдаёт content-length — проверяем до скачивания
  const lenHeader = res.headers.get("content-length");
  if (lenHeader) {
    const len = Number(lenHeader);
    if (Number.isFinite(len) && len > MAX_BYTES) {
      throw new Error(`Audio file too large: ${len} bytes (max ${MAX_BYTES})`);
    }
  }

  // Читаем поток с лимитом
  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("Audio response has no body");
  }

  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    received += value.byteLength;
    if (received > MAX_BYTES) {
      try { reader.cancel(); } catch {}
      throw new Error(`Audio download exceeded limit: > ${MAX_BYTES} bytes`);
    }
    chunks.push(value);
  }

  const audioBytes = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    audioBytes.set(c, offset);
    offset += c.byteLength;
  }
  // Если нет ключа (или dummy) — в dev лучше вернуть пусто,
  // чтобы пайплайн не падал и дальше сработал fallback/skip.
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "dummy-openai-key") {
    return "";
  }

  const openai = getOpenAIClient();

  // Попробуем угадать расширение по content-type (минимально)
  const ext =
    ct.includes("mpeg") || ct.includes("mp3") ? "mp3" :
    ct.includes("wav") ? "wav" :
    ct.includes("mp4") ? "mp4" :
    "audio";

  // openai-node умеет toFile(Buffer, filename)
  const file = await toFile(Buffer.from(audioBytes), `call.${ext}`);
  const out = await openai.audio.transcriptions.create({
    model: "gpt-4o-mini-transcribe", // можно заменить на whisper-1
    file,
    // language: "ru",
  });

  return (out as any)?.text ?? "";

}


