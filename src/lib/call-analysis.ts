// src/lib/call-analysis.ts
import { db } from "@/lib/db";
import { CallStatus } from "@prisma/client";
import { getOpenAIClient } from "@/lib/openai";
import { transcribeAudioBytes } from "@/lib/transcription";
import { getCallsQuota } from "@/lib/call-quota";
import { amoGetAccessTokenForCompany } from "@/lib/amocrm";

import dns from "node:dns/promises";
import net from "node:net";

/* ============================================================
   Helpers: safe fetch (SSRF guard) + bytes download
============================================================ */

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
    if (a === 169 && b === 254) return true;
    return false;
  }
  if (net.isIP(ip) === 6) {
    const norm = ip.toLowerCase();
    if (norm === "::1") return true;
    if (norm.startsWith("fc") || norm.startsWith("fd")) return true;
    if (norm.startsWith("fe80")) return true;
    return false;
  }
  return true;
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

function guessFilenameFromContentType(ct: string) {
  const s = (ct || "").toLowerCase();
  if (s.includes("mpeg") || s.includes("mp3")) return "call.mp3";
  if (s.includes("wav")) return "call.wav";
  if (s.includes("mp4")) return "call.mp4";
  if (s.includes("m4a")) return "call.m4a";
  if (s.includes("ogg")) return "call.ogg";
  return "call.audio";
}

async function fetchBytes(params: {
  url: string;
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
}): Promise<{ bytes: Uint8Array; contentType: string; filename: string }> {
  const url = params.url;
  if (!isValidHttpUrl(url)) throw new Error("Invalid audio URL");

  const u = new URL(url);
  await assertNoPrivateNetwork(u);

  const TIMEOUT_MS = Math.max(5_000, Math.min(120_000, params.timeoutMs ?? 30_000));
  const MAX_BYTES = Math.max(
    1_000_000,
    Math.min(25 * 1024 * 1024, params.maxBytes ?? 25 * 1024 * 1024)
  );

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "CallXAI/1.0",
        Accept: "audio/*,application/octet-stream,*/*",
        ...(params.headers || {}),
      },
    });
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    // иногда полезно увидеть кусок тела
    let body = "";
    try {
      body = (await res.text())?.slice(0, 400) || "";
    } catch {}
    throw new Error(`Audio download failed: ${res.status} ${res.statusText}${body ? ` | ${body}` : ""}`);
  }

  const ct = (res.headers.get("content-type") || "").toLowerCase();
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
      try {
        await reader.cancel();
      } catch {}
      throw new Error(`Audio download exceeded limit: > ${MAX_BYTES} bytes`);
    }
    chunks.push(value);
  }

  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }

  return {
    bytes: out,
    contentType: ct || "application/octet-stream",
    filename: guessFilenameFromContentType(ct || ""),
  };
}

/* ============================================================
   LLM scoring
============================================================ */

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

function extractFirstJsonObject(text: string): string | null {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

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
  score: number; // 0–100
  sentiment: "positive" | "neutral" | "negative";
  summary: string;
  metrics: Record<MetricKey, MetricScore>;
  issues: string[];
  managerSpeechPercent: number;
  raw: any;
};

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

  const sentiment: "positive" | "neutral" | "negative" =
    parsed?.sentiment === "positive" || parsed?.sentiment === "negative"
      ? parsed.sentiment
      : "neutral";

  return {
    score: clampInt(parsed?.score, 0, 100, 0),
    sentiment,
    summary: typeof parsed?.summary === "string" ? parsed.summary : "",
    metrics,
    issues: Array.isArray(parsed?.issues) ? parsed.issues.map(String).slice(0, 25) : [],
    managerSpeechPercent: clampFloat(parsed?.managerSpeechPercent, 0, 100, 0),
    raw: parsed ?? {},
  };
}

export async function analyzeTranscript(transcript: string): Promise<CallAnalysisResult> {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "dummy-openai-key") {
    throw new Error("OPENAI_API_KEY is not configured (scoring)");
  }

  const openai = getOpenAIClient();

  const systemPrompt = `
Ты — AI-аналитик звонков для sales-команд (недвижимость/продажи).
Верни СТРОГО JSON (без текста вокруг).

Схема:
{
  "score": 0-100,
  "sentiment": "positive"|"neutral"|"negative",
  "summary": "2-4 предложения",
  "metrics": {
    "greeting": {"score":0-10,"comment":""},
    "reaction": {"score":0-10,"comment":""},
    "empathy": {"score":0-10,"comment":""},
    "needs": {"score":0-10,"comment":""},
    "presentation": {"score":0-10,"comment":""},
    "price": {"score":0-10,"comment":""},
    "objections": {"score":0-10,"comment":""},
    "closing": {"score":0-10,"comment":""},
    "clarity": {"score":0-10,"comment":""},
    "length": {"score":0-10,"comment":""}
  },
  "managerSpeechPercent": 0-100,
  "issues": ["строки..."],
  "details": {}
}
`.trim();

  const completion: any = await (openai as any).chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: transcript.slice(0, 15000) },
    ],
  });

  const raw = completion?.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Empty response from OpenAI (scoring)");

  let parsed: any;
  try {
    const extracted = typeof raw === "string" ? extractFirstJsonObject(raw) ?? raw : raw;
    parsed = typeof extracted === "string" ? JSON.parse(extracted) : extracted;
  } catch {
    throw new Error("Failed to parse JSON from OpenAI (scoring)");
  }

  return normalizeAnalysis(parsed);
}

/* ============================================================
   Orchestrator: processCall(callId)
============================================================ */

function isAmoHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "amocrm.ru" ||
    h.endsWith(".amocrm.ru") ||
    h === "amocrm.com" ||
    h.endsWith(".amocrm.com") ||
    h === "amocrm.kz" ||
    h.endsWith(".amocrm.kz")
  );
}

export async function processCall(callId: string) {
  // Важно: гарантируем перевод в DONE/ERROR
  try {
    const call = await db.call.findUnique({
      where: { id: callId },
      select: {
        id: true,
        companyId: true,
        status: true,
        duration: true,
        audioUrl: true,
        audioUrlExternal: true,
        meta: true,
      },
    });

    if (!call) throw new Error(`Call not found: ${callId}`);

    // already DONE
    if (call.status === CallStatus.DONE) return;

    // already claimed by other worker
    if (call.status === CallStatus.PROCESSING) return;

    const claimed = await db.call.updateMany({
      where: { id: call.id, status: { in: [CallStatus.NEW, CallStatus.ERROR] } },
      data: { status: CallStatus.PROCESSING },
    });

    if (claimed.count === 0) return;

    // quality gate (billableMinDurationSec)
    const quota = await getCallsQuota(call.companyId);
    const billableMin = Number((quota as any)?.billableMinDurationSec ?? 0) || 0;

    const dur = Number(call.duration ?? 0) || 0;
    if (!dur || (billableMin > 0 && dur < billableMin)) {
      await db.call.update({
        where: { id: call.id },
        data: {
          status: CallStatus.DONE,
          meta: {
            ...(call.meta as any),
            pipeline: {
              ...((call.meta as any)?.pipeline ?? {}),
              billableMinDurationSec: billableMin,
              stt: { ok: true, skipped: true, reason: "duration_below_billable_min", duration: dur },
            },
          },
        } as any,
      });
      return;
    }

    // transcript idempotency
    const existingTranscript = await db.callTranscript.findUnique({
      where: { callId: call.id },
      select: { rawTranscript: true },
    });

    let transcript = (existingTranscript?.rawTranscript || "").trim();

    let usedUrl: string | null = null;
    let usedHost: string | null = null;
    let contentType = "application/octet-stream";
    let filename = "call.audio";
    let audioBytesLen = 0;

    if (!transcript) {
      const audioCandidates: Array<{ kind: "storage" | "external"; url: string }> = [];
      if (typeof call.audioUrl === "string" && call.audioUrl) audioCandidates.push({ kind: "storage", url: call.audioUrl });
      if (typeof call.audioUrlExternal === "string" && call.audioUrlExternal)
        audioCandidates.push({ kind: "external", url: call.audioUrlExternal });

      if (!audioCandidates.length) throw new Error("No audioUrl/audioUrlExternal on call");

      // token получаем только если реально понадобится (amo-host + external)
      let amoAuthHeader: Record<string, string> | undefined;

      let audioBytes: Uint8Array | null = null;
      let lastDownloadError: string | null = null;

      for (const c of audioCandidates) {
        try {
          const u = new URL(c.url);
          const host = u.hostname.toLowerCase();

          let headers: Record<string, string> | undefined;

          const needsAmoAuth = c.kind === "external" && isAmoHost(host);
          if (needsAmoAuth) {
            if (!amoAuthHeader) {
              const { accessToken } = await amoGetAccessTokenForCompany(call.companyId);
              amoAuthHeader = { Authorization: `Bearer ${accessToken}` };
            }
            headers = amoAuthHeader;
          }

          const downloaded = await fetchBytes({
            url: c.url,
            timeoutMs: 60_000,
            maxBytes: 25 * 1024 * 1024,
            headers,
          });

          audioBytes = downloaded.bytes;
          contentType = downloaded.contentType;
          filename = downloaded.filename;
          usedUrl = c.url;
          usedHost = host;
          lastDownloadError = null;
          break;
        } catch (e: any) {
          lastDownloadError = e?.message ?? String(e);
          continue;
        }
      }

      if (!audioBytes) {
        throw new Error(`Audio download failed for all candidates: ${lastDownloadError || "unknown"}`);
      }

      audioBytesLen = audioBytes.byteLength;

      const transcriptText = await transcribeAudioBytes({
        bytes: audioBytes,
        filename,
        mimeType: contentType,
        model: "gpt-4o-mini-transcribe",
      });

      transcript = (transcriptText || "").trim();
      if (!transcript) throw new Error("Empty transcript returned by STT");

      await db.callTranscript.upsert({
        where: { callId: call.id },
        create: { callId: call.id, rawTranscript: transcript } as any,
        update: { rawTranscript: transcript } as any,
      });
    }

    // score idempotency
    const existingScore = await db.callScore.findUnique({
      where: { callId: call.id },
      select: {
        totalScore: true,
        summary: true,
        issues: true,
        details: true,
        talkRatioManager: true,
      },
    });

    let analysis: CallAnalysisResult;

    if (existingScore && typeof existingScore.totalScore === "number") {
      analysis = {
        score: existingScore.totalScore,
        sentiment: "neutral",
        summary: existingScore.summary ?? "",
        metrics: ((existingScore.details as any) ?? {}) as any,
        issues: (existingScore.issues as any) ?? [],
        managerSpeechPercent: Number(existingScore.talkRatioManager ?? 0) || 0,
        raw: {},
      };
    } else {
      analysis = await analyzeTranscript(transcript);

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
        } as any,
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
        } as any,
      });
    }

    await db.call.update({
      where: { id: call.id },
      data: {
        status: CallStatus.DONE,
        meta: {
          ...(call.meta as any),
          pipeline: {
            ...((call.meta as any)?.pipeline ?? {}),
            stt: {
              ok: true,
              skipped: !!existingTranscript?.rawTranscript,
              usedUrl,
              usedHost,
              filename,
              contentType,
              bytes: audioBytesLen || null,
            },
            scoring: {
              ok: true,
              model: "gpt-4o-mini",
              skipped: !!(existingScore && typeof existingScore.totalScore === "number"),
            },
            billableMinDurationSec: billableMin,
          },
          ai: {
            summary: analysis.summary,
            issues: analysis.issues,
            sentiment: analysis.sentiment,
            score: analysis.score,
            raw: analysis.raw,
          },
        },
      } as any,
    });
  } catch (e: any) {
    // ВАЖНО: возвращаем статус из PROCESSING -> ERROR и пишем причины
    const msg = e?.message ?? String(e);

    try {
      await db.call.update({
        where: { id: callId },
        data: {
          status: CallStatus.ERROR,
          meta: {
            pipeline: {
              stt: { ok: false, error: msg },
            },
          },
        } as any,
      });
    } catch {}

    throw e;
  }
}
