// src/lib/openai.ts
import OpenAI from "openai";

const OPENAI_TIMEOUT_MS = 25_000;
const OPENAI_MAX_RETRIES = 2;

/**
 * Важно: на Vercel (serverless) модули могут пересоздаваться.
 * В dev/hmr — тоже. Поэтому кэшируем client в globalThis.
 */
const globalForOpenAI = globalThis as unknown as {
  __openaiClient?: OpenAI;
};

function createClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;

  // В production отсутствие ключа — фатально.
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("OPENAI_API_KEY is not set. Production cannot run without it.");
    }

    // В dev можно жить без ключа, но НЕ создаём dummy client,
    // чтобы не было “как будто работает”. Пусть падает при вызове STT/LLM.
    throw new Error("OPENAI_API_KEY is not set (dev). Configure it to enable STT/LLM.");
  }

  return new OpenAI({
    apiKey,
    timeout: OPENAI_TIMEOUT_MS,
    maxRetries: OPENAI_MAX_RETRIES,
  });
}

/**
 * Единственная точка получения OpenAI клиента.
 * Если ключа нет — бросает понятную ошибку.
 */
export function getOpenAIClient(): OpenAI {
  if (!globalForOpenAI.__openaiClient) {
    globalForOpenAI.__openaiClient = createClient();
  }
  return globalForOpenAI.__openaiClient;
}
