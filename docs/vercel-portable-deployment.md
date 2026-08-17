# Portable private deployment: Vercel, TiDB Cloud, R2, Google OAuth, and Gmail drafts

## What this migration changes

The portable branch keeps the core application in TypeScript/Express/React and adds conventional provider boundaries. It does **not** publish the application or alter the current managed preview. Its user-owned services are listed below.

| Concern | Portable choice | Security boundary |
|---|---|---|
| Private access | Google OAuth allowlisted to `OWNER_GOOGLE_EMAIL` | Google’s passkey or authenticator protects the Google account; this app receives only verified identity claims. |
| App session | Signed, HTTP-only 12-hour owner cookie | The server checks the exact configured owner email on each protected application request. |
| Resume attachment | Server-generated DOCX from the already approved resume | The attachment route rejects drafts lacking a recipient, email body, resume, or approval timestamp. |
| Gmail operation | Gmail API `users.drafts.create` only | There is no send endpoint. The user opens Gmail and presses Send manually. |
| Database | TiDB Cloud Serverless (MySQL-compatible) | Use the TLS `DATABASE_URL` supplied by TiDB; do not expose it to the browser. |
| Files | Cloudflare R2 (S3-compatible) | Access keys remain server-side; the browser receives only short-lived signed URLs. |
| Hosting | Vercel serverless function + static React build | The source is portable Express code with a Vercel handler under `api/index.ts`. |

## Before deployment

> Keep the current repository and the dedicated `job-automation-preserve-version` backup unchanged. Work from the `portable-migration` branch until all callback and draft checks pass.

1. Create a **TiDB Cloud Serverless** cluster and database. Copy its TLS connection string.
2. Create a private **Cloudflare R2** bucket named `job-automation-private`. Create an R2 API token scoped only to that bucket with object read/write permissions.
3. In Google Cloud Console, configure an OAuth **Web application** client. Add the final Vercel callbacks exactly:

   ```text
   https://your-project.vercel.app/api/portable/auth/google/callback
   https://your-project.vercel.app/api/portable/gmail/callback
   ```

   Add `https://your-project.vercel.app` as an authorized JavaScript origin. Keep the localhost callbacks during development. Do not use placeholders, whitespace, or wildcard domains.
4. Put the owner’s Google address on the OAuth consent-screen **Test users** list while testing. For a consumer Google account in testing mode, reauthorization may be needed periodically; a production OAuth publishing/verification decision is needed before treating Gmail access as permanent.
5. Generate two unrelated 32+ character secrets for `OWNER_SESSION_SECRET` and `GMAIL_TOKEN_ENCRYPTION_KEY`. Store all values in Vercel’s encrypted environment-variable settings, not source control.

## Database migration

The portable path adds a non-destructive `gmail_connections` table that stores one encrypted Gmail refresh token per owner. With `DATABASE_URL` pointed at TiDB, apply the reviewed migrations before first deployment:

```bash
pnpm drizzle-kit migrate
```

Verify the schema in TiDB afterwards. Do not run destructive reset commands against the existing personal data.

## Vercel configuration

1. Import the private GitHub repository into Vercel and select the `portable-migration` branch.
2. Set every value from `.env.portable.example` in **Project Settings → Environment Variables** for Preview and Production. Do **not** set `BUILT_IN_FORGE_API_URL` or `BUILT_IN_FORGE_API_KEY` externally.
3. Deploy the preview build. `vercel.json` routes the request to the portable Express API and `api/index.ts` serves the built React application.
4. Copy the actual preview/production URL into `PORTABLE_APP_BASE_URL`, add its two Google callback URLs, then redeploy. OAuth redirects must exactly match the final public URL.
5. Set `PORTABLE_AUTH_ENABLED=true` only after all required values are present. With it enabled, personal profile, job, drafting, and import routes require the verified allowlisted owner session.

## Owner sign-in and Gmail attachment verification

1. Open the deployment in a signed-out browser. It should show **Continue with Google** rather than application data.
2. Sign in with the configured owner Google account. A different account must be rejected.
3. Choose **Connect Gmail for attachment**. Grant only the requested Gmail compose/draft permission. The OAuth exchange requests an offline refresh token, encrypted before database storage.
4. In a saved application, ensure all four prerequisites are true: stored recipient email, generated email body, generated one-page resume, and explicit resume approval.
5. Press **Draft with resume**. The server creates a Gmail **draft** with the approved DOCX attached. Inspect the Gmail Drafts folder. Do not press Send during validation.
6. Confirm drafts without one of the four prerequisites are blocked. There is deliberately no API route that sends mail.

## Portability and optional AI drafting

The attachment feature does not call any AI service. It generates the DOCX from the reviewed resume text stored in the database. The current AI drafting feature remains a separate provider boundary: it may remain enabled in the managed environment or be replaced later with a user-selected AI provider. Do not place any server key in client-side `VITE_` variables.

## Recovery and rollback

If a portable change fails, keep `PORTABLE_AUTH_ENABLED` unset/false in the managed environment, revert the Vercel deployment to its previous release, and retain the preserved GitHub repository as a clean recovery point. Gmail tokens can be revoked at any time from the Google Account third-party access page; reconnecting then requires owner sign-in and consent again.
