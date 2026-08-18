# SETUP.md — Rebuild and deployment guide

## Prerequisites

Install Node.js 22+, pnpm 10.4+, Git, and an account for Vercel, TiDB Cloud, Google Cloud OAuth, Gemini API, and optionally Groq. Use a modern browser for Google OAuth and Gmail. The repository is ESM (`"type":"module"`) and TypeScript strict mode is enabled.

## Exact dependency manifest

The authoritative full manifest is `package.json`. Application/runtime packages: `@aws-sdk/client-s3 ^3.907.0`, `@aws-sdk/s3-request-presigner ^3.907.0`, `@hookform/resolvers ^5.2.2`, all listed Radix packages `^1.x/2.x`, `@tanstack/react-query ^5.90.2`, `@trpc/client`, `@trpc/react-query`, `@trpc/server ^11.6.0`, `axios ^1.12.0`, `cheerio ^1.2.0`, `class-variance-authority ^0.7.1`, `clsx ^2.1.1`, `cmdk ^1.1.1`, `cookie ^1.0.2`, `date-fns ^4.1.0`, `docx ^9.7.1`, `dotenv ^17.2.2`, `drizzle-orm ^0.44.5`, `embla-carousel-react ^8.6.0`, `express ^4.21.2`, `framer-motion ^12.23.22`, `input-otp ^1.4.2`, `jose 6.1.0`, `jspdf ^4.2.1`, `lucide-react ^0.453.0`, `mysql2 ^3.15.0`, `nanoid ^5.1.5`, `next-themes ^0.4.6`, `react/react-dom ^19.2.1`, `react-day-picker ^9.11.1`, `react-hook-form ^7.64.0`, `react-resizable-panels ^3.0.6`, `recharts ^2.15.2`, `sonner ^2.0.7`, `streamdown ^1.4.0`, `superjson ^1.13.3`, `tailwind-merge ^3.3.1`, `tailwindcss-animate ^1.0.7`, `vaul ^1.1.2`, `wouter ^3.3.5`, `xlsx ^0.18.5`, `zod ^4.1.12`.

Dev packages: `@builder.io/vite-plugin-jsx-loc ^0.1.1`, `@tailwindcss/typography ^0.5.15`, `@tailwindcss/vite ^4.1.3`, `@types/express 4.17.21`, `@types/google.maps ^3.58.1`, `@types/node ^24.7.0`, `@types/react/react-dom ^19.2.1`, `@vitejs/plugin-react ^5.0.4`, `add ^2.0.6`, `autoprefixer ^10.4.20`, `drizzle-kit ^0.31.4`, `esbuild ^0.25.0`, `jszip ^3.10.1`, `pnpm ^10.15.1`, `postcss ^8.4.47`, `prettier ^3.6.2`, `tailwindcss ^4.1.14`, `tsx ^4.19.1`, `tw-animate-css ^1.4.0`, `typescript 5.9.3`, `vite ^7.1.7`, `vite-plugin-manus-runtime 0.0.59`, `vitest ^2.1.4`. The lockfile and `packageManager` field are the reproducible source of truth.

## Environment variables

Create a private `.env` for local server use; never commit it. For Vercel, add these in Project Settings → Environment Variables for Production (and Preview as required).

| Variable | Required in portable deployment | Example format only | Purpose |
|---|---|---|---|
| `PORTABLE_AUTH_ENABLED` | Yes | `true` | Turns on Google owner gate and portable policy. |
| `VITE_PORTABLE_AUTH_ENABLED` | Yes for UI | `true` | Client-visible feature flag only; never a secret. |
| `PORTABLE_APP_BASE_URL` | Yes | `https://job-automation.example.vercel.app` | Canonical origin and Google callback base. No trailing slash required. |
| `OWNER_GOOGLE_EMAIL` | Yes | `owner@example.com` | Single allowed Google identity. |
| `GOOGLE_OAUTH_CLIENT_ID` | Yes | `1234567890-abc.apps.googleusercontent.com` | Google OAuth web client id. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Yes | `GOCSPX-example-secret` | Google OAuth web client secret; server-only. |
| `OWNER_SESSION_SECRET` | Yes | `a-random-string-at-least-32-characters-long` | HS256 signing key; code rejects shorter values. |
| `GMAIL_TOKEN_ENCRYPTION_KEY` | Yes if Gmail enabled | Base64 encoding of exactly 32 random bytes | AES-256-GCM key used for Gmail refresh token. |
| `DATABASE_URL` | Yes | `mysql://user:password@host:4000/job_automation?ssl={...}` | TiDB/MySQL connection string; TLS parser handles TiDB configuration. |
| `GEMINI_API_KEY` | Yes for drafting | `AIza...` | Primary server-only Gemini credential. |
| `GROQ_API_KEY` | Optional | `gsk_...` | Server-only alternate Groq credential. UI disables it when absent. |
| `NODE_ENV` | Local/host supplied | `development` / `production` | Runtime mode. |
| `PORT` | Local host supplied | `3000` | Local Express listener; do not hardcode in production. |

Legacy non-portable starter variables are `VITE_APP_ID`, `JWT_SECRET`, `OAUTH_SERVER_URL`, `OWNER_OPEN_ID`, `BUILT_IN_FORGE_API_URL`, and `BUILT_IN_FORGE_API_KEY`; optional legacy storage variables are documented by `server/storage.ts`/`portable/objectStorage.ts`. They are not needed for the portable Vercel deployment because `createApiApp()` avoids importing legacy OAuth when `PORTABLE_AUTH_ENABLED=true`.

## Clean-machine local setup

1. Clone the private repository: `git clone <your-repository-url> job-automation && cd job-automation`.
2. Install exact locked dependencies: `corepack enable && pnpm install --frozen-lockfile`.
3. Create a TiDB Cloud Serverless/Starter cluster and a `job_automation` database. Create a least-privilege SQL user, copy its TLS connection string into `DATABASE_URL`.
4. Create a Google Cloud project; configure OAuth consent screen; create a **Web application** OAuth client; add local callback URIs: `http://localhost:3000/api/portable/auth/google/callback` and `http://localhost:3000/api/portable/gmail/callback`. Add the owner as a testing user when consent is not published.
5. Create a Gemini API key and optionally a Groq API key. Do not put either into any `VITE_*` value.
6. Generate secrets. Example commands: `openssl rand -base64 32` for `GMAIL_TOKEN_ENCRYPTION_KEY`; `openssl rand -base64 48` for `OWNER_SESSION_SECRET`. The encryption key must decode to 32 bytes; secret must be at least 32 characters.
7. Populate `.env` with the portable variables above and `PORTABLE_APP_BASE_URL=http://localhost:3000`.
8. Run migrations: `pnpm drizzle-kit migrate` (the Vercel build also runs this). Inspect migration policy before production usage; the current `vercel.json` intentionally does this during build.
9. Start local server: `pnpm dev`. It runs `tsx watch server/_core/index.ts`. Browse the URL shown by the process, sign in with exactly `OWNER_GOOGLE_EMAIL`, save Master Profile text, then create a job.
10. Validate: `pnpm test`, `pnpm check`, `pnpm build`. The production build produces Vite assets plus ESM Vercel handler and verifies the Vercel entry.

## Vercel deployment

1. Import the Git repository into Vercel. Set project root to repository root; framework can be Other/Vite because `vercel.json` is authoritative.
2. Add every portable variable above as encrypted Vercel environment variables. Update `PORTABLE_APP_BASE_URL` to the production URL.
3. Add the two production callback URLs to the same Google OAuth client. Google client redirect URI mismatches produce OAuth errors.
4. Deploy. `vercel.json` runs `pnpm drizzle-kit migrate && pnpm build`, serves `dist/public`, includes `dist/**` in `api/index.js`, and rewrites every route to `/api` so the handler can serve SPA assets and APIs.
5. Visit `/api/portable/auth/status`, complete owner sign-in, connect Gmail, then make an eligible approved-resume draft test. Confirm Gmail displays a draft; do not expect automatic sending.

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Local Express/Vite watch mode. |
| `pnpm build` | Vite client, local server bundle, Vercel handler bundle, entry check. |
| `pnpm build:vercel` | Alternative API bundle target. |
| `pnpm start` | Runs built local `dist/index.js`. |
| `pnpm check` | TypeScript `--noEmit`. |
| `pnpm test` | Vitest suite. |
| `pnpm db:push` | Generates then migrates Drizzle schema; use carefully against production. |
| `pnpm format` | Prettier write. |

## Operational notes

The model provider free tiers can return 429 after a small number of calls; the app surfaces this without persistence. Select another configured provider or wait. Gmail requires a non-empty recipient, generated email, approved one-page resume, and a stored Gmail connection. Portable mode intentionally rejects raw resume PDF upload, requires pasted master resume text, and has no R2/S3 dependency for normal operation.
