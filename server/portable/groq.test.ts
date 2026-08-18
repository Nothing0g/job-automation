import { describe, expect, it, vi } from "vitest";
import { GROQ_API_URL, GROQ_FALLBACK_MODEL, generateGroqText } from "./groq";

describe("Groq portable fallback", () => {
  it("uses the documented server-side Chat Completions endpoint and preserves system instructions", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "Grounded fallback draft" } }],
    }), { status: 200 }));

    const text = await generateGroqText({
      apiKey: "server-only-groq-key",
      maxOutputTokens: 900,
      messages: [
        { role: "system", content: "Use only the supplied factual profile." },
        { role: "user", content: "Write a factual outreach draft." },
      ],
      fetchImpl,
    });

    expect(text).toBe("Grounded fallback draft");
    expect(fetchImpl).toHaveBeenCalledWith(GROQ_API_URL, expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer server-only-groq-key" }),
    }));
    const request = fetchImpl.mock.calls[0][1];
    expect(JSON.parse(request.body).model).toBe(GROQ_FALLBACK_MODEL);
    expect(JSON.parse(request.body).messages[0]).toEqual({ role: "system", content: "Use only the supplied factual profile." });
  });
});

const groqKeyForIntegrationTest = process.env.GROQ_API_KEY?.trim();
const integrationIt = groqKeyForIntegrationTest ? it : it.skip;

describe("Groq server credential", () => {
  integrationIt("accepts the configured server-only key for a minimal models request", async () => {
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${groqKeyForIntegrationTest}` },
    });

    expect(response.ok).toBe(true);
    const payload = await response.json() as { data?: unknown[] };
    expect(Array.isArray(payload.data)).toBe(true);
  }, 15_000);
});
