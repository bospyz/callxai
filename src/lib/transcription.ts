import { getOpenAIClient } from "./openai";
import OpenAI from "openai";

const openai = getOpenAIClient() as any;

/**
 * Качаем аудио по URL и отправляем в OpenAI (gpt-4o-mini-transcribe / whisper-1).
 */
export async function transcribeAudioFromUrl(audioUrl: string): Promise<string> {
  const res = await fetch(audioUrl);

  if (!res.ok) {
    throw new Error(
      `Failed to download audio for transcription: ${res.status} ${res.statusText}`
    );
  }

  const arrayBuffer = await res.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);

  // Правильный способ передать файл в новый OpenAI SDK
  const file = await (OpenAI as any).toFile(uint8, "call-audio.mp3");

  const transcription: any = await (openai as any).audio.transcriptions.create({
    file,
    // можно оставить whisper-1, но gpt-4o-mini-transcribe быстрее и дешевле
    model: "gpt-4o-mini-transcribe",
  });

  return transcription?.text ?? "";
}
