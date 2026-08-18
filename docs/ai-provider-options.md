# Hosted AI Provider Options for Job Automation Studio

## Scope

This note compares current hosted alternatives only for the private, no-card Job Automation Studio workflow. It does not approve a provider migration or place any API key in client-side code.

## Verified findings

Groq documents a Free Plan with fixed organization-level request and token limits. Its published limits include 30 requests per minute and 1,000 requests per day for `openai/gpt-oss-20b` and `openai/gpt-oss-120b`, with 8,000 tokens per minute and 200,000 tokens per day for those models. Groq’s current models documentation lists those production text models and an OpenAI-compatible models endpoint. This makes Groq a technically straightforward server-side fallback, but its daily limits may be restrictive for repeated resume plus outreach regeneration.

Groq’s official Chat Completions API accepts chronological `system`, `user`, and `assistant` messages at `https://api.groq.com/openai/v1/chat/completions`. It uses a Bearer API-key header and the modern `max_completion_tokens` parameter. The fallback implementation should use the documented text model `openai/gpt-oss-20b`, with no browser-exposed API key and no tools or web-search capability enabled.[1] [2]

NVIDIA Build documents an account and API-key flow for its NIM API catalogue and lists a broad hosted model catalogue, including instruction and reasoning-capable Llama and Nemotron models. Its public pages promote development access but do not provide a stable, explicit no-card consumption commitment or a durable public limit table in the retrieved documentation. NVIDIA is therefore viable for experimentation but less predictable as the primary dependency for this personal production workflow.

Gemini remains the simplest currently configured provider because the user already has a server-only key and the application is now migrated to the active `gemini-3.6-flash` model. The former failure arose from a retired model identifier, not an invalid API key or an inherent inability to generate drafts.

## Selected implementation

The application now supports an explicit owner-selected provider rather than silently changing providers after an error. The Job Workspace selector offers **Gemini** and **Groq**, remembers the owner’s browser-local selection, and sends only the selected provider name to the server. It never sends an API key to the browser, database, or generated DOCX/PDF.

Gemini remains the default. Groq is available only after its server-side key has been configured. The UI exposes configuration state and disables generation for an unconfigured provider instead of falling back silently.

| Provider | Vercel production environment variable | In-app selection |
|---|---|---|
| Gemini | `GEMINI_API_KEY` | **Gemini** |
| Groq | `GROQ_API_KEY` | **Groq** |

To activate Groq, create an API key in the Groq console, then open **Vercel → job-automation → Settings → Environment Variables**, add `GROQ_API_KEY` for **Production**, and redeploy the latest `main` deployment. Paste no key into the application or into chat. Once the deployment is Ready, refresh a Job Workspace and select **Groq** before generating. No additional Vercel setting is needed for Gemini because its existing key stays server-side.

NVIDIA Build is not included in the selector because its no-card access commitment and long-term limits were not sufficiently clear for this private production workflow. It can be evaluated later as a separate, explicitly approved adapter.

## Sources

1. Groq, [Rate Limits](https://console.groq.com/docs/rate-limits), accessed 2026-08-18.
2. Groq, [Supported Models](https://console.groq.com/docs/models), accessed 2026-08-18.
3. NVIDIA, [Build: Discover](https://build.nvidia.com/explore/discover), accessed 2026-08-18.
4. NVIDIA, [Build Model Catalogue](https://build.nvidia.com/models), accessed 2026-08-18.
5. Groq, [Text Generation](https://console.groq.com/docs/text-chat), accessed 2026-08-18.
6. Groq, [API Reference: Create Chat Completion](https://console.groq.com/docs/api-reference), accessed 2026-08-18.
