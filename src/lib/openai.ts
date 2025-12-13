import OpenAI from "openai";

const OPENAI_TIMEOUT_MS = 25000;
const OPENAI_MAX_RETRIES = 2;


let client: OpenAI | null = null;

/**
 * Safe OpenAI client.
 * - В production без ключа падаем с ошибкой
 * - В dev можем использовать dummy-ключ, чтобы не ломать билд
 */
export function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "OPENAI_API_KEY is not set. Cannot start in production without it."
        );
      }
      console.warn(
        "[openai] OPENAI_API_KEY is not set. Using dummy key in non-production."
      );
      client = new OpenAI({ apiKey: "dummy-openai-key", timeout: OPENAI_TIMEOUT_MS, maxRetries: OPENAI_MAX_RETRIES });
    } else {
      client = new OpenAI({ apiKey, timeout: OPENAI_TIMEOUT_MS, maxRetries: OPENAI_MAX_RETRIES });
    }
  }
  return client;
}


