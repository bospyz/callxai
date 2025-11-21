import OpenAI from "openai";

let client: OpenAI | null = null;

/**
 * Safe OpenAI client.
 * - Не бросает ошибку при импорте
 * - Для билдов без ключа использует dummy-ключ
 */
export function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY || "dummy-openai-key";
    client = new OpenAI({ apiKey });
  }
  return client;
}
