# Portable Hosting and Gmail Attachment Plan

**Prepared for:** Personal Job Automation Studio  
**Scope:** Planning only; no deployment or application behavior is changed by this document.

## Recommendation

Use **Vercel Hobby for the application**, **TiDB Cloud Starter for the existing MySQL-compatible database**, **Cloudflare R2 for uploaded resume files**, and a **Google-account allowlist** for private access. The Gmail attachment feature should use a **user-owned Google Cloud OAuth client** and Gmail’s draft endpoint—not a platform connector, and not an AI service.

This is the lowest-change path because the current application already runs as Node/Express with `mysql2` and Drizzle. TiDB Cloud’s Starter tier remains MySQL compatible and documents a free quota. Cloudflare R2 exposes an S3-compatible object-storage interface, so it replaces the current platform storage adapter without changing the core file-storage model. Vercel is a suitable low-traffic personal host, but the current Express server must be adapted to a function-compatible deployment shape. [1] [2] [3]

> **Important boundary:** Gmail attachments can be completely independent of AI. AI may remain optional for resume drafting, but creating a Gmail draft will work from any already-approved resume, including one you edited manually.

## Private access choice

| Option | How it works | Strengths | Limitation | Recommendation |
|---|---|---|---|---|
| **Google sign-in allowlist** | You sign in with your Google account; the server validates the OpenID Connect ID token and accepts only your immutable Google `sub` and approved email. | Uses your existing Google passkey, Google Authenticator, or other Google MFA. It is recoverable on a new laptop through your Google account. | Requires a short sign-in flow when the app session expires. | **Choose this.** |
| **Passkey-only WebAuthn** | The website registers a passkey from your laptop’s platform authenticator, such as Windows Hello, Touch ID, or a security key. | No Google login page and no password. | A device loss can lock you out unless you register at least two authenticators and keep recovery codes safely. | Add later only if you prefer it. |
| **No application gate** | Anyone who knows the public URL can access the site. | Simplest deployment. | Not private. A secret URL is not authentication. | Do not use. |

Your Google-account passkey is not transferred to the website itself. Instead, it protects the Google sign-in used by the website. Google’s OpenID Connect flow provides a verifiable ID token; the application should verify it server-side and check the Google subject identifier against a one-person allowlist. [4]

## Target architecture

| Layer | Current dependency | Portable replacement | Migration outcome |
|---|---|---|---|
| Web server | Long-running Express process inside the current managed runtime | Vercel function-compatible Express adapter, or a small Node runtime if Vercel’s serverless limits become unsuitable | Same React/tRPC user experience on a conventional host |
| Personal access | Current direct personal access | Google OIDC allowlist plus signed, HttpOnly session cookie | Private single-owner access without multi-user product accounts |
| Database | Managed MySQL-compatible database | TiDB Cloud Starter | Existing Drizzle MySQL schema and queries retained with minimal change |
| Master-resume files | Current storage proxy and built-in storage key | Cloudflare R2 using the existing S3 SDK | Files stored under your own account and bucket |
| AI drafting | Built-in platform LLM connection | Optional provider adapter or manual drafting | AI does not affect Gmail attachment capability |
| Gmail draft | Browser compose URL, which cannot attach files | Google Gmail API `users.drafts.create` using a server-side MIME message | A real Gmail **draft** with an approved DOCX/PDF attachment; no automatic send |

## Gmail draft-with-attachment design

The portable implementation will request only the Gmail composition scope, `gmail.compose`. The server will never expose a send endpoint or call `users.messages.send`; it will create a draft only. Gmail’s draft model uses an unsent message with the `DRAFT` label, and supports RFC 2822/MIME content, which can include a DOCX or PDF attachment. [5] [6]

The application will enforce the following policy in code.

| Required condition | Enforcement |
|---|---|
| Verified private owner session | The draft route rejects unauthenticated sessions. |
| Stored recipient email | The draft route rejects blank or malformed recipients. |
| Approved one-page resume | The route rejects unapproved or absent resume drafts. |
| User-visible confirmation | The UI shows recipient, subject, filename, and attachment type before draft creation. |
| No sending | The server implements `createDraft` only; no send route, button, or background action exists. |
| Token security | Google refresh token is encrypted at rest and never sent to the browser. |

The first version should attach **DOCX**, because it can be reproduced deterministically with the already-installed document library. A PDF attachment can follow after we factor the existing client-side export code into a server-side renderer or add a portable PDF renderer. In both cases, the attachment is generated from the approved resume only.

## Step-by-step migration plan

| Step | Work | Done when |
|---|---|---|
| 1. Preserve and branch | Retain the existing GitHub preserve-version repository as the rollback point. Create a separate `portable-hosting` branch for the migration. | The current app can be restored independently of the migration. |
| 2. Extract platform adapters | Replace the platform OAuth, storage proxy, environment access, and built-in LLM calls with small interfaces: `IdentityProvider`, `FileStorage`, `ResumeDraftProvider`, and `GmailDraftProvider`. | The domain features do not import platform-specific runtime modules. |
| 3. Add single-owner Google access | Create a Google Cloud OAuth web client. Configure the production callback URL. Validate Google ID tokens server-side and allow only your Google `sub`/email. Issue secure local sessions. | Only your Google account reaches the workspace. |
| 4. Add independent Gmail authorization | Run a second Google OAuth consent connection for Gmail `gmail.compose`, or combine it carefully with the login flow while separating scopes and token storage. Persist the encrypted refresh token to the database. | Your account can reconnect Gmail without a platform connector. |
| 5. Build draft-only attachment endpoint | Generate a DOCX from the approved resume, create a MIME message with the recipient, subject, body, and attachment, then call Gmail’s draft-create endpoint. | Gmail shows a draft with the attachment; no email is sent. |
| 6. Move file storage | Create a private R2 bucket, configure S3-compatible credentials, migrate any master-resume file object, and keep signed download URLs short-lived. | Uploaded files are held in your own storage account. |
| 7. Move database | Create TiDB Cloud Starter database, set `DATABASE_URL`, run the existing Drizzle migrations, and import only your current data. | Profile, applications, approvals, and tracker data behave as before. |
| 8. Adapt deployment shape | Package the server for Vercel’s supported function model, move environment values into Vercel project secrets, and set production callback URLs. | Preview and production deployments pass test and health checks. |
| 9. Verify privacy and recovery | Test access from the personal laptop, an unapproved browser, a new device, expired sessions, Gmail revocation, missing recipient, and lost-passkey recovery. | The system fails closed and has a documented recovery path. |
| 10. Cut over carefully | Deploy to a non-indexed production URL, verify the production callback and Gmail draft, then retain the current site and backup until you confirm the new version. | You can switch hosts without losing a working fallback. |

## Google OAuth operational note

For a personal Gmail account, do not leave the Google OAuth consent configuration in **Testing** if you need durable Gmail draft access: Google documents that refresh tokens issued in Testing can expire after seven days. Before cutover, review the current Google OAuth publishing and verification requirements for the selected scopes and move to the appropriate production configuration. [7]

## What remains optional

The current AI role/JD tailoring can remain exactly as it is while hosted here. During portability work, it becomes an optional `ResumeDraftProvider`: you may configure a provider you own later, or disable automatic drafting and continue editing/approving resumes manually. **The Gmail attachment workflow will not depend on it.**

## Approval required before implementation

I recommend the following locked-in decisions before any migration code is written:

1. Use **Google-account allowlist authentication** for private access, protected by your existing Google passkey or authenticator.
2. Use **Vercel Hobby + TiDB Cloud Starter + Cloudflare R2** for the first portable deployment, with the understanding that free-tier limits and terms can change.
3. Use a **user-owned Google Cloud OAuth client** with the minimal Gmail draft scope and a draft-only endpoint.
4. Attach the **approved DOCX** first; retain PDF as a later extension.

## References

[1]: https://vercel.com/docs/plans/hobby "Vercel Hobby plan"
[2]: https://www.pingcap.com/tidb-cloud-starter-pricing-details/ "TiDB Cloud Starter pricing details"
[3]: https://developers.cloudflare.com/r2/pricing/ "Cloudflare R2 pricing"
[4]: https://developers.google.com/identity/openid-connect/openid-connect "OpenID Connect | Sign in with Google"
[5]: https://developers.google.com/workspace/gmail/api/guides/drafts "Create and send draft emails | Gmail"
[6]: https://developers.google.com/workspace/gmail/api/auth/scopes "Choose Gmail API scopes"
[7]: https://developers.google.com/identity/protocols/oauth2 "Using OAuth 2.0 to Access Google APIs"
