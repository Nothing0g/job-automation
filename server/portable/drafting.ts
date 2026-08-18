import type { Message } from "../_core/llm";
import { GeminiProviderError, generateGeminiText } from "./gemini";
import { GroqProviderError, generateGroqText } from "./groq";

export const portableDraftProviders = ["gemini", "groq"] as const;
export type PortableDraftProvider = typeof portableDraftProviders[number];

type DraftRequest = {
  geminiApiKey: string;
  groqApiKey: string | null;
  provider?: PortableDraftProvider;
  messages: Message[];
  maxOutputTokens: number;
};

export async function generatePortableDraftText(
  request: DraftRequest,
  providers: {
    generateGemini?: typeof generateGeminiText;
    generateGroq?: typeof generateGroqText;
  } = {},
) {
  const gemini = providers.generateGemini ?? generateGeminiText;
  const groq = providers.generateGroq ?? generateGroqText;
  if (request.provider === "groq") {
    if (!request.groqApiKey) {
      throw new GroqProviderError("Groq is not configured. Add GROQ_API_KEY in Vercel Environment Variables, redeploy, then select Groq again.");
    }
    return groq({
      apiKey: request.groqApiKey,
      messages: request.messages,
      maxOutputTokens: request.maxOutputTokens,
    });
  }
  return gemini({
    apiKey: request.geminiApiKey,
    messages: request.messages,
    maxOutputTokens: request.maxOutputTokens,
  });
}
