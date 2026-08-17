# Portable Runtime Boundary Map

## Purpose

This document records the current platform-specific seams before the portable migration begins. The migration must preserve the existing personal-workspace behavior in development while moving external deployments to user-owned services.

| Current seam | Existing implementation | Portable replacement | Compatibility requirement |
|---|---|---|---|
| Personal identity | Manus OAuth SDK plus a direct-access personal-user fallback | Google OpenID Connect ID token checked against a single configured owner email | Existing tRPC procedures continue receiving one admin `user` record. |
| Session | Platform JWT/session cookie flow | Application-signed, `httpOnly`, `secure`, `sameSite=lax` owner session cookie | Existing protected procedures continue to use `ctx.user`. |
| Resume/file storage | Forge presigned object-storage calls served through `/manus-storage/*` | Cloudflare R2 S3 API, with local development fallback | Keep `storagePut`, `storageGet`, and `storageGetSignedUrl` contracts stable. |
| Gmail handoff | Browser compose URL; an agent connector can prepare drafts outside the deployed app | User-owned Google OAuth refresh token plus Gmail API `users.drafts.create` | Allow draft creation only. No endpoint will call Gmail’s send API. |
| Resume drafting | Built-in LLM endpoint | Optional provider interface; approved static/master resume workflows remain usable without it | Gmail attachment never invokes AI. |
| Database | Generic Drizzle/MySQL connection supplied by the current runtime | TiDB Cloud Serverless MySQL connection string | Existing schema and Drizzle access remain valid. |
| HTTP server | Express process started from `server/_core/index.ts` | Express export used by a Vercel serverless entry, with the existing local listener retained | Development server behavior stays unchanged. |

## Non-negotiable Safety Rules

The portable path will have a **single allowlisted owner account**; it will not introduce public registration, multi-user workspaces, or admin invitation flows. Gmail OAuth requests only compose/draft capability, and the server will reject attachment-draft requests unless the application has both a non-empty recipient and an approved resume. The client cannot supply arbitrary file bytes to Gmail; the server retrieves the approved document from controlled storage.

## Migration Sequence

The migration is intentionally additive. Provider interfaces and tests are introduced first, then Google owner access and the draft-only provider, followed by the Vercel/S3 configuration. The current Manus-specific runtime remains available as a development compatibility path until the portable deployment has passed regression and security-boundary checks.
