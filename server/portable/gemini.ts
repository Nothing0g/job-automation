import type { Message, MessageContent } from "../_core/llm";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

type GeminiPart = { text?: string };
type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  error?: { message?: string };
};

export class GeminiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiProviderError";
  }
}

function contentToText(content: MessageContent | MessageContent[]) {
  const values = Array.isArray(content) ? content : [content];
  return values.map(value => {
    if (typeof value === "string") return value;
    if (value.type === "text") return value.text;
    throw new GeminiProviderError("Portable Gemini drafting accepts pasted resume text only. Upload the source document to your own backup location, then paste its factual text into Master Profile.");
  }).join("\n");
}

export async function generateGeminiText({
  apiKey,
  messages,
  maxOutputTokens,
  fetchImpl = fetch,
}: {
  apiKey: string;
  messages: Message[];
  maxOutputTokens: number;
  fetchImpl?: typeof fetch;
}) {
  const systemInstruction = messages
    .filter(message => message.role === "system")
    .map(message => contentToText(message.content))
    .filter(Boolean)
    .join("\n\n");
  const contents = messages
    .filter(message => message.role !== "system")
    .map(message => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: contentToText(message.content) }],
    }));

  if (!systemInstruction || contents.length === 0) {
    throw new GeminiProviderError("The grounded drafting request could not be prepared. Please save your master resume and try again.");
  }

  let response: Response;
  try {
    response = await fetchImpl(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: { maxOutputTokens, temperature: 0.2 },
      }),
    });
  } catch {
    throw new GeminiProviderError("Gemini could not be reached. Check your connection and try again.");
  }

  const payload = await response.json().catch(() => ({})) as GeminiResponse;
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new GeminiProviderError("Gemini rejected the server API key. Check GEMINI_API_KEY in the private deployment settings.");
    }
    if (response.status === 429) {
      throw new GeminiProviderError("Gemini Free Tier limit reached. Please wait and try again later.");
    }
    throw new GeminiProviderError(payload.error?.message?.trim() || "Gemini could not create a draft. Please try again.");
  }

  const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("").trim();
  if (!text) {
    throw new GeminiProviderError("Gemini returned an empty draft. Please try again.");
  }
  return text;
}
