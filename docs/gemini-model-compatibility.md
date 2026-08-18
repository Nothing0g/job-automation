# Gemini Production Model Compatibility

The production resume-generation error reported on 18 August 2026 states that `models/gemini-2.5-flash` is no longer available to new users and explicitly directs callers to `models/gemini-3.6-flash`. Google’s official Gemini API model guide lists `gemini-3.6-flash` as a stable Flash endpoint, while the release notes record its general availability on 21 July 2026. Google’s deprecations guide lists no shutdown date for `gemini-3.6-flash` as of its 13 August 2026 update.

The portable provider must therefore use the exact model identifier `gemini-3.6-flash`, not a `models/`-prefixed identifier in source code. The request URL construction adds the `models/` segment. This keeps the app on a stable server-side Gemini endpoint and does not change the privacy boundary: `GEMINI_API_KEY` remains a server-only Vercel environment variable.

## Sources

1. [Google Gemini API Models](https://ai.google.dev/gemini-api/docs/models)
2. [Google Gemini API Release Notes](https://ai.google.dev/gemini-api/docs/changelog)
3. [Google Gemini API Deprecations](https://ai.google.dev/gemini-api/docs/deprecations)

## Claude API comparison

Claude’s free consumer chat access is separate from API access. Anthropic’s current billing guidance states that Claude API and Workbench usage is paid from prepaid usage credits, which must be purchased before API use. Therefore, Claude does not satisfy the project’s durable no-card requirement, even though a new account may occasionally receive limited test credit. It should be adopted only if the owner later chooses to purchase credits and provide a server-only `ANTHROPIC_API_KEY`; it is not a free-drop-in replacement for the portable Gemini provider.

4. [Anthropic: How do I pay for my Claude API usage?](https://support.claude.com/en/articles/8977456-how-do-i-pay-for-my-claude-api-usage)
5. [Anthropic Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
