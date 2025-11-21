import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY || "DUMMY_KEY_FOR_BUILD_ONLY";

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  if (!client) {
    client = new OpenAI({
      apiKey,
    });
  }

  return client;
}

// Для старого кода, если где-то ещё используется:
export const openai = getOpenAIClient();
export default openai;
