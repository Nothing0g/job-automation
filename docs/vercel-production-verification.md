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

### Current Vercel packaging finding

The current ready deployment still fails before the handler starts. Vercel’s official guidance confirms that functions use static import analysis to trace runtime files and that dynamic loads need `includeFiles` coverage; it also advises inspecting the compiled module resolution path for module-not-found failures.[1][2] The runtime error references an extensionless ESM import from `/var/task/api/index.js` to `/var/task/server/_core/app`, so the next repair must preserve statically traceable imports while ensuring the function receives a Node-resolvable bundled artifact rather than relying on Vercel to resolve the TypeScript project’s extensionless internal module graph.

The revised arrangement uses a tracked `api/index.js` wrapper and has the normal build generate a self-contained handler bundle from the TypeScript serverless handler. Vercel is explicitly instructed to package both the handler bundle and `dist/public` static site output.

The initial CommonJS bundle surfaced two constraints: its static import of the combined Vite/static helper embedded development-only Vite configuration, and it attempted to `require()` the ESM-only `jose` JWT package. Production static delivery remains isolated in a Vite-free module, and the emitted Vercel handler is now ESM (`dist/vercel-handler.mjs`) so `jose` loads natively without an unsupported CommonJS conversion.

The first wrapper deployment was rejected by Vercel’s configuration validator before it ran the build because this project’s configuration schema accepts one `includeFiles` string rather than an array. The function now uses the required `dist/**` string glob, which packages both the generated handler bundle and the compiled client assets.

Vercel does not recognize `.cjs` as a source function extension in the `api` directory, so the tracked source entry remains `api/index.js`. Because the package and generated handler now use ESM, the wrapper directly default-imports `dist/vercel-handler.mjs`, ensuring Vercel receives an invokable handler while preserving native ESM resolution.

### Portable bootstrap dependency isolation

The Vercel build emitted `[OAuth] ERROR: OAUTH_SERVER_URL is not configured` while importing the serverless handler bundle. That variable belongs to the managed platform OAuth flow and is intentionally absent from the portable Vercel environment. Portable mode now avoids loading the managed OAuth routes and SDK authentication path entirely; it uses only the configured owner-only Google authentication flow. Application creation is asynchronous so this conditional module loading works in both the local Express server and the Vercel handler. A focused regression test verifies the managed OAuth callback is not registered in portable mode.

The isolated bootstrap passed 87 tests, the TypeScript check, and the Vercel-targeted build. The build no longer emits the missing `OAUTH_SERVER_URL` warning, confirming that the managed OAuth SDK is absent from the portable serverless startup path.

[1]: https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions
[2]: https://vercel.com/kb/guide/how-do-i-resolve-a-module-not-found-error
