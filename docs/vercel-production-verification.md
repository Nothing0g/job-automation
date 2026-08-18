# Vercel Production Verification Record

## 2026-08-18: Post-migration deployment

The Vercel production deployment for commit `b90d85f` reached `READY` state after TiDB migrations and the Vite build completed. The stable project domain `https://job-automation-omega.vercel.app` served the client application shell from an unsigned-in browser session.

The unsigned browser request to `GET /api/portable/auth/status` returned Vercel `500 FUNCTION_INVOCATION_FAILED` with request ID `cle1::cb5xm-1787025458429-20dad5d753cb`. The next step is to inspect Vercel runtime logs, correct the serverless route failure, and then resume Google OAuth callback configuration and owner-only access validation.

### Root cause and local correction

The portable route parser decoded every cookie in the incoming header with `decodeURIComponent`. A malformed percent-encoded value in any unrelated browser or platform cookie could throw before the unsigned status response was returned. The parser now preserves malformed values verbatim and allows normal owner-session verification to treat an invalid token as unsigned. The repair is covered by three focused tests and passed the full suite (85 tests), TypeScript check, and Vercel-targeted build locally.
