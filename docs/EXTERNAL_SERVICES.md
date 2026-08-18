# EXTERNAL_SERVICES.md — Integrations and trust boundaries

## Service inventory

| Service | Code owners | Responsibility | Credential/authentication | Browser exposure |
|---|---|---|---|---|
| Google OAuth 2.0 / OpenID Connect | `portable/googleOAuth.ts`, `ownerSession.ts`, `routes.ts` | Owner sign-in and Gmail consent | OAuth web client id/secret, authorization-code exchange, Google ID token and JWKS verification | Client id is server config; secret is server-only. |
| Google Gmail API | `portable/googleOAuth.ts`, `gmailDraft.ts`, `routes.ts` | Refreshes token and creates a draft with approved DOCX attachment | Encrypted OAuth refresh token; access token is refreshed server-side | No token or send authority is exposed to browser. |
| Gemini Generative Language API | `portable/gemini.ts` | Primary grounded text generation | `GEMINI_API_KEY` request header `x-goog-api-key` | Never exposed. |
| Groq Chat Completions API | `portable/groq.ts` | Explicitly selected alternative/fallback text generation | `GROQ_API_KEY` `Authorization: Bearer` | Never exposed. |
| TiDB Cloud / MySQL | `db.ts`, `portable/tidbTls.ts`, `drizzle.config.ts` | SQL persistence and Drizzle migrations | `DATABASE_URL`; TLS-enabled client config | No direct browser connection. |
| Vercel | `vercel.json`, `api/index.js`, `vercel/handler.ts` | Serverless deployment and static SPA hosting | Vercel project/environment configuration | Public endpoint protected by owner auth. |
| Legacy Manus Forge (non-portable only) | `_core/llm.ts`, `storage.ts`, `storageProxy.ts`, `dataApi.ts`, `map.ts`, etc. | Starter-template LLM, storage and platform routes | `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` | Not required in portable production; legacy OAuth is conditionally not imported. |
| Public job board search URLs | `client/lib/jobDiscovery.ts` | Redirects to filtered searches on selected boards | No API key; ordinary outbound URL navigation | Only search URL opens; listings are not scraped/stored by this flow. |

## Google owner sign-in

The owner sign-in entry is `GET /api/portable/auth/google`. `registerPortableRoutes()` creates random state, writes it to `job_automation_google_state`, and redirects to `googleAuthorizationUrl(config, { state, gmail: false })`.

`googleAuthorizationUrl()` uses Google Accounts OAuth with a redirect URI produced by `portableRedirect(config, "/api/portable/auth/google/callback")`. The callback must exactly match the Google Cloud Console authorized redirect URI. `GET /api/portable/auth/google/callback` verifies query state with `equalState()`, posts the authorization code to `https://oauth2.googleapis.com/token`, verifies the returned `id_token` using Google’s JWKS at `https://www.googleapis.com/oauth2/v3/certs`, checks `audience === GOOGLE_OAUTH_CLIENT_ID`, issuer in `GOOGLE_ISSUERS`, `email_verified`, and `email === OWNER_GOOGLE_EMAIL` after lowercasing.

The successful callback writes a `job_automation_owner` cookie containing a HS256 `jose` JWT with issuer `job-automation-studio`, audience `job-automation-owner`, `{ email, subject }`, and a `12h` expiration. It redirects to `/`. No broad user registration exists.

| Required Google client configuration | Exact value |
|---|---|
| OAuth client type | Web application |
| Sign-in redirect URI | `${PORTABLE_APP_BASE_URL}/api/portable/auth/google/callback` |
| Gmail redirect URI | `${PORTABLE_APP_BASE_URL}/api/portable/gmail/callback` |
| Owner allowlist | Exactly the lowercase `OWNER_GOOGLE_EMAIL` identity carried by a verified Google ID token. |
| OAuth consent test user | Owner must be admitted if the Google consent screen remains in testing. |

## Gmail OAuth and draft-only API

`GET /api/portable/gmail/connect` is owner-gated and redirects to OAuth with Gmail consent. `GET /api/portable/gmail/callback` enforces distinct state (`job_automation_gmail_state`), requires a refresh token, verifies that the returned Google identity is the same owner email, encrypts the refresh token using `encryptPortableSecret()`, and upserts it in `gmail_connections`.

`gmailAccessToken()` decrypts the saved refresh token and sends a token-refresh form request to `https://oauth2.googleapis.com/token`. `createDraftOnly()` builds a MIME `multipart/mixed` message and sends the following request:

```http
POST https://gmail.googleapis.com/gmail/v1/users/me/drafts
Authorization: Bearer <short-lived-access-token>
Content-Type: application/json

{"message":{"raw":"<base64url MIME message>"}}
```

The expected response shape is `{ "id": "draftId", "message": { "id": "messageId" } }`, converted to `{ draftId, messageId }`. The product never calls `users.messages.send`, so Gmail remains a human-review/manual-send handoff. The required scope is `https://www.googleapis.com/auth/gmail.compose` (draft creation/management, not mail send).

| Gmail draft failure | Where surfaced |
|---|---|
| Not signed in / wrong owner | `401` owner route response. |
| Cross-origin POST | `403` same-origin response. |
| Invalid job id | `400`. |
| Missing recipient, email, resume, or approval | `400` eligibility response. |
| Gmail unconnected | `409`. |
| Refresh, DOCX, or Gmail API failure | `502` with safe error text. |

## Gemini API

`generateGeminiText()` converts internal `Message[]` into Gemini `systemInstruction` plus non-system `contents`, then posts:

```http
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent
Content-Type: application/json
x-goog-api-key: <GEMINI_API_KEY>

{
  "systemInstruction":{"parts":[{"text":"..."}]},
  "contents":[{"role":"user","parts":[{"text":"..."}]}],
  "generationConfig":{"maxOutputTokens":2600,"temperature":0.2}
}
```

Response extraction is `candidates[0].content.parts[].text` concatenated and trimmed. `401`/`403` become a private-key configuration error; `429` becomes **“Gemini Free Tier limit reached. Please wait and try again later.”**; blank/non-JSON/error response becomes a provider error. The configured code makes no automatic cross-provider retry: the user intentionally chooses Gemini or Groq in the workspace. Quota limits are provider-plan controlled and should be treated as variable rather than hardcoded.

## Groq API

`generateGroqText()` serializes each internal message to `{ role, content }` and posts:

```http
POST https://api.groq.com/openai/v1/chat/completions
Authorization: Bearer <GROQ_API_KEY>
Content-Type: application/json

{
  "model":"openai/gpt-oss-20b",
  "messages":[{"role":"system","content":"..."},{"role":"user","content":"..."}],
  "temperature":0.2,
  "max_completion_tokens":2600,
  "stream":false
}
```

It reads `choices[0].message.content`. HTTP 429 is deliberately visible as **“Groq Free Plan limit reached. Please wait and try again later.”** A missing `GROQ_API_KEY` prevents use of selected Groq with a configuration-specific error. As with Gemini, exact free-plan allowance changes externally and is not encoded by the app.

## TiDB Cloud

`DATABASE_URL` is read only on the server. `getTiDbCertificateVerifiedCredentials()` parses compatible TiDB URLs and gives Drizzle TLS-safe credentials; otherwise `drizzle(process.env.DATABASE_URL)` is used. `drizzle.config.ts` uses the same parser for migrations. Database users require create/read/update/delete access to the `job_automation` schema and TLS connectivity.

## Storage boundary

Portable mode calls `portableRawResumeFilesAllowed()` and returns false, which causes `profile.uploadPdf` to reject input before `storagePut()`. This design avoids an S3/R2 requirement and avoids retaining original resume bytes. Legacy `storage.ts` can call Forge object storage or optional S3-compatible `objectStorage.ts`, but a portable deployment must not depend on those paths for ordinary resume tailoring.

## Security rules for a rebuild

1. Add all secrets only to server deployment settings; do not prefix provider secrets with `VITE_`.
2. Treat Google callback state, session JWT, and Gmail refresh token as security material; keep their cookies `httpOnly` and their token encryption key valid.
3. Keep `Origin === PORTABLE_APP_BASE_URL` enforcement on attached-draft POSTs.
4. Keep all model prompts, responses, and database calls on the server. Browser code may only invoke typed tRPC/RPC routes.
5. Preserve manual-send behavior even if broader Gmail scopes appear available.
