import { describe, expect, it, vi } from "vitest";
import { generatePortableDraftText } from "./drafting";

const request = {
  geminiApiKey: "gemini-key",
  groqApiKey: "groq-key",
  maxOutputTokens: 700,
  messages: [
    { role: "system" as const, content: "Use only supported facts." },
    { role: "user" as const, content: "Draft a factual email." },
  ],
};

describe("portable drafting provider selection", () => {
  it("uses explicitly selected Groq with the same grounded messages", async () => {
    const generateGemini = vi.fn();
    const generateGroq = vi.fn().mockResolvedValue("Groq grounded draft");

    await expect(generatePortableDraftText({ ...request, provider: "groq" }, { generateGemini, generateGroq })).resolves.toBe("Groq grounded draft");
    expect(generateGroq).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "groq-key",
      messages: request.messages,
    }));
    expect(generateGemini).not.toHaveBeenCalled();
  });

  it("uses Gemini by default without silently switching providers", async () => {
    const generateGemini = vi.fn().mockResolvedValue("Gemini grounded draft");
    const generateGroq = vi.fn();

    await expect(generatePortableDraftText(request, { generateGemini, generateGroq })).resolves.toBe("Gemini grounded draft");
    expect(generateGroq).not.toHaveBeenCalled();
  });

  it("explains how to configure Groq instead of attempting a request without a private key", async () => {
    await expect(generatePortableDraftText({ ...request, groqApiKey: null, provider: "groq" })).rejects.toThrow("Add GROQ_API_KEY in Vercel Environment Variables");
  });
});
