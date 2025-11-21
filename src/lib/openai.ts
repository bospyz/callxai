import OpenAI from "openai";

/**
 * ВАЖНО:
 * - Локально использует реальный OPENAI_API_KEY из .env
 * - На Vercel, если переменная не задана, подставляет заглушку,
 *   чтобы сборка не падала. Запросы с этим ключом просто будут 401.
 */

const apiKey = process.env.OPENAI_API_KEY || "DUMMY_KEY_FOR_BUILD";

export const openai = new OpenAI({
  apiKey,
});
