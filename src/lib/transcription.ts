// src/lib/transcription.ts
import { getOpenAIClient } from "@/lib/openai";
import { toFile } from "openai/uploads";

import dns from "node:dns/promises";
import net from "node:net";

/**
 * ВАЖНО: этот модуль должен выполняться в Node runtime.
 * Если ты случайно задеплоишь его в edge-роут — будут падения/странности.
 */

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024; // 25MB (под лимиты STT)
const DEFAULT_TIMEOUT_MS = 30_000;

function requireOpenAIKey() {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "dummy-openai-key") {
    throw new Error("OPENAI_API_KEY is not configured");
  }
}

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

  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new Error("SSRF blocked: localhost is not allowed");
  }

  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("SSRF blocked: private IP is not allowed");
    return;
  }

  const res = await dns.lookup(host, { all: true, verbatim: true });
  for (const r of res) {
    if (isPrivateIp(r.address)) throw new Error("SSRF blocked: resolves to private IP");
  }
}

function guessExtFromContentType(ct: string): string {
  const s = (ct || "").toLowerCase();
  if (s.includes("mpeg") || s.includes("mp3")) return "mp3";
  if (s.includes("wav")) return "wav";
  if (s.includes("mp4")) return "mp4";
  if (s.includes("m4a")) return "m4a";
  if (s.includes("ogg")) return "ogg";
  return "audio";
}

/**
 * Основной API: транскрибирует аудио из bytes.
 */
export async function transcribeAudioBytes(params: {
  bytes: Uint8Array | Buffer;
  filename?: string; // например "call.mp3"
  mimeType?: string; // например "audio/mpeg"
  model?: string;    // "gpt-4o-mini-transcribe" или "whisper-1"
}): Promise<string> {
  requireOpenAIKey();

  const bytes = Buffer.isBuffer(params.bytes) ? params.bytes : Buffer.from(params.bytes);
  if (!bytes.length) throw new Error("transcribeAudioBytes: empty audio bytes");

  const filename = params.filename?.trim() || "call.audio";
  const model = params.model || "gpt-4o-mini-transcribe";

  const openai = getOpenAIClient();

  // openai-node: toFile(buffer, filename)
  const file = await toFile(bytes, filename, { type: params.mimeType });

  const out = await openai.audio.transcriptions.create({
    model,
    file,
    // language: "ru", // включишь, если хочешь жёстко фиксировать
  });

  const text = (out as any)?.text ?? "";
  return typeof text === "string" ? text : "";
}

/**
 * Опционально: транскрипция по публичному URL.
 * ВАЖНО: для amoCRM часто НЕ подходит (403/401).
 */
export async function transcribeAudioFromUrl(audioUrl: string, opts?: {
  maxBytes?: number;
  timeoutMs?: number;
  model?: string;
}): Promise<string> {
  requireOpenAIKey();

  if (!audioUrl || !isValidHttpUrl(audioUrl)) {
    throw new Error("Invalid audioUrl for transcription");
  }

  const u = new URL(audioUrl);
  await assertNoPrivateNetwork(u);

  const MAX_BYTES = Math.max(1_000_000, Math.min(DEFAULT_MAX_BYTES, opts?.maxBytes ?? DEFAULT_MAX_BYTES));
  const TIMEOUT_MS = Math.max(5_000, Math.min(120_000, opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS));

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(audioUrl, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "CallXAI-Transcriber/1.0",
        Accept: "audio/*,application/octet-stream,*/*",
      },
    });
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    throw new Error(`Failed to download audio: ${res.status} ${res.statusText}`);
  }

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const looksAudio =
    ct.startsWith("audio/") ||
    ct.includes("octet-stream") ||
    ct.includes("mpeg") ||
    ct.includes("mp4") ||
    ct.includes("m4a") ||
    ct.includes("ogg") ||
    ct.includes("wav");

  if (!looksAudio) {
    throw new Error(`Unexpected content-type for audio: ${ct || "unknown"}`);
  }

  const lenHeader = res.headers.get("content-length");
  if (lenHeader) {
    const len = Number(lenHeader);
    if (Number.isFinite(len) && len > MAX_BYTES) {
      throw new Error(`Audio file too large: ${len} bytes (max ${MAX_BYTES})`);
    }
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Audio response has no body");

  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    received += value.byteLength;
    if (received > MAX_BYTES) {
      try { await reader.cancel(); } catch {}
      throw new Error(`Audio download exceeded limit: > ${MAX_BYTES} bytes`);
    }
    chunks.push(value);
  }

  const buf = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }

  const ext = guessExtFromContentType(ct);
  return transcribeAudioBytes({
    bytes: buf,
    filename: `call.${ext}`,
    mimeType: ct || "application/octet-stream",
    model: opts?.model,
  });
}
