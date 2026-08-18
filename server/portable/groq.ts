import type { Message, MessageContent } from "../_core/llm";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_FALLBACK_MODEL = "openai/gpt-oss-20b";

type GroqResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};

export class GroqProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroqProviderError";
  }
}

function contentToText(content: MessageContent | MessageContent[]) {
  const values = Array.isArray(content) ? content : [content];
  return values.map(value => {
    if (typeof value === "string") return value;
    if (value.type === "text") return value.text;
    throw new GroqProviderError("Portable Groq drafting accepts pasted resume text only. Upload the source document to your own backup location, then paste its factual text into Master Profile.");
  }).join("\n");
}

export async function generateGroqText({
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
  const preparedMessages = messages.map(message => ({
    role: message.role,
    content: contentToText(message.content),
  }));
  if (!preparedMessages.some(message => message.role === "system") || !preparedMessages.some(message => message.role === "user")) {
    throw new GroqProviderError("The grounded drafting request could not be prepared. Please save your master resume and try again.");
  }

  let response: Response;
  try {
    response = await fetchImpl(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_FALLBACK_MODEL,
        messages: preparedMessages,
        temperature: 0.2,
        max_completion_tokens: maxOutputTokens,
        stream: false,
      }),
    });
  } catch {
    throw new GroqProviderError("Groq could not be reached. Please try again later.");
  }

  const payload = await response.json().catch(() => ({})) as GroqResponse;
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new GroqProviderError("Groq rejected the server API key. Check GROQ_API_KEY in the private deployment settings.");
    }
    if (response.status === 429) {
      throw new GroqProviderError("Groq Free Plan limit reached. Please wait and try again later.");
    }
    throw new GroqProviderError(payload.error?.message?.trim() || "Groq could not create a fallback draft. Please try again.");
  }

  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) throw new GroqProviderError("Groq returned an empty fallback draft. Please try again.");
  return text;
}

export { GROQ_API_URL, GROQ_FALLBACK_MODEL };
