# Vercel Production Verification Record

## 2026-08-18: Post-migration deployment

The Vercel production deployment for commit `b90d85f` reached `READY` state after TiDB migrations and the Vite build completed. The stable project domain `https://job-automation-omega.vercel.app` served the client application shell from an unsigned-in browser session.

The unsigned browser request to `GET /api/portable/auth/status` returned Vercel `500 FUNCTION_INVOCATION_FAILED` with request ID `cle1::cb5xm-1787025458429-20dad5d753cb`. The next step is to inspect Vercel runtime logs, correct the serverless route failure, and then resume Google OAuth callback configuration and owner-only access validation.

### Root cause and local correction

The portable route parser decoded every cookie in the incoming header with `decodeURIComponent`. A malformed percent-encoded value in any unrelated browser or platform cookie could throw before the unsigned status response was returned. The parser now preserves malformed values verbatim and allows normal owner-session verification to treat an invalid token as unsigned. The repair is covered by three focused tests and passed the full suite (85 tests), TypeScript check, and Vercel-targeted build locally.

### Follow-up deployment check

Vercel built commit `0e1f0d2f` successfully as production deployment `dpl_CGWDAZwqniCBjPLwS2nVRB5AN2Fq`. The immutable deployment URL redirects an unsigned browser to Vercel login, confirming deployment-level Vercel protection for that URL. The stable project domain still returned `FUNCTION_INVOCATION_FAILED` for the portable status route, so the next diagnosis must focus on the Vercel serverless handler/bootstrap rather than the already-corrected cookie parser.

### Serverless bootstrap diagnostics

The current Vercel build completes the database migrations and creates the production deployment, but the protected diagnostic fetch of the exact deployment still returns `FUNCTION_INVOCATION_FAILED` before a route response is produced. The serverless entry now initializes the Express application lazily and writes bootstrap failures to Vercel runtime logs while returning only a generic error to browsers. This preserves secrecy of environment values and will make the next production invocation reveal the concrete fault rather than an opaque Vercel error page.

The controlled request identified the concrete packaging issue: Vercel's ESM output did not include dynamically imported local application modules (`ERR_MODULE_NOT_FOUND` for `/var/task/server/_core/app`). The entry keeps lazy application construction but now uses static imports, allowing Vercel to bundle the factory and static-serving helper while retaining safe startup diagnostics.
