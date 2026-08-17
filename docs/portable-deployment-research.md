# Portable Deployment Research

## Retrieved provider constraints

| Topic | Finding | Planning implication | Source |
|---|---|---|---|
| Existing application runtime | The project is an Express/tRPC Node server with a Vite client and MySQL-compatible Drizzle adapter. Its current entry point registers platform OAuth and storage proxy routes. | A portable version needs a conventional Node server or a serverless adaptation, plus replacement identity and storage adapters. | Local project inspection: `package.json`, `server/_core/index.ts`, and `server/storage.ts` |
| Vercel Hobby | Vercel documents a Hobby plan and separate usage limits. | Suitable for personal, low-traffic hosting only after the Express entry is adapted to Vercel functions or migrated to a framework-native serverless layout. | https://vercel.com/docs/plans/hobby |
| TiDB Cloud Starter | TiDB Cloud documents a free Starter tier, including a free quota and MySQL compatibility. | Lowest-change database choice because the existing Drizzle code uses `mysql2`. Free quotas are not a permanence guarantee. | https://www.pingcap.com/tidb-cloud-starter-pricing-details/ |
| Cloudflare R2 | R2 pricing documents 10 GB-month of standard storage in its free allowance. | A portable replacement for the platform-specific master-resume file storage, using the existing S3-compatible SDK. | https://developers.cloudflare.com/r2/pricing/ |
| Gmail draft API | Gmail drafts are unsent messages carrying the `DRAFT` label; the Gmail API supports raw RFC 2822/MIME content, which permits a DOCX or PDF attachment. | The portable site can generate an approved DOCX server-side, construct a MIME message, and call the draft-create endpoint. The app must never call a send endpoint. | https://developers.google.com/workspace/gmail/api/guides/drafts |
| Gmail OAuth scope | The `gmail.compose` scope supports composing/managing drafts and is broader than a UI-only handoff. | Use only `gmail.compose`, never add `gmail.send`, and enforce a server route that creates a draft only. | https://developers.google.com/workspace/gmail/api/auth/scopes |
| Personal Google OAuth | Google documents that refresh tokens issued while an OAuth consent screen remains in Testing expire in 7 days. | A personal Gmail integration must plan for either routine reauthorization in Testing or moving the consent screen to Production after reviewing Google’s current verification rules. | https://developers.google.com/identity/protocols/oauth2 |
| Google account authentication | Google’s OpenID Connect guide describes validation of an ID token. | A personal Google-account allowlist can verify the immutable Google subject (`sub`) and email on the server, then issue an application session. The user’s existing Google passkey/MFA protects the Google sign-in. | https://developers.google.com/identity/openid-connect/openid-connect |

## Research conclusion

The lowest-change portable architecture is a Node-capable host, TiDB Cloud Starter, Cloudflare R2, and a user-owned Google Cloud OAuth client. Vercel can host a small personal workload, but the current long-running Express entry must be refactored into a compatible serverless deployment shape. For the private-access gate, a Google-account allowlist is simpler and more recoverable than a new passkey-only WebAuthn system. A WebAuthn-only gate remains viable if it includes at least two registered authenticators and securely stored recovery codes.
