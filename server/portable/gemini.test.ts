import { describe, expect, it, vi } from "vitest";
import { GeminiProviderError, generateGeminiText } from "./gemini";

const messages = [
  { role: "system" as const, content: "Use only supplied facts." },
  { role: "user" as const, content: "Candidate source: built reports in SQL." },
];

describe("portable Gemini provider", () => {
  it("sends prompts only from the server request and returns text", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "Grounded draft" }] } }],
    }), { status: 200 }));

    await expect(generateGeminiText({ apiKey: "server-only-key", messages, maxOutputTokens: 900, fetchImpl })).resolves.toBe("Grounded draft");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("gemini-2.5-flash:generateContent");
    expect(init.headers["x-goog-api-key"]).toBe("server-only-key");
    expect(init.body).toContain("Use only supplied facts.");
    expect(init.body).not.toContain("server-only-key");
  });

  it("gives an actionable message for a free-tier rate limit", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 }));
    await expect(generateGeminiText({ apiKey: "key", messages, maxOutputTokens: 900, fetchImpl })).rejects.toEqual(
      expect.objectContaining<Partial<GeminiProviderError>>({ message: expect.stringContaining("Free Tier limit") }),
    );
  });

  it("rejects non-text source attachments instead of forwarding them to Gemini", async () => {
    await expect(generateGeminiText({
      apiKey: "key",
      maxOutputTokens: 900,
      messages: [...messages, { role: "user", content: { type: "file_url", file_url: { url: "https://example.com/resume.pdf" } } }],
    })).rejects.toEqual(expect.objectContaining<Partial<GeminiProviderError>>({ message: expect.stringContaining("pasted resume text") }));
  });
});
