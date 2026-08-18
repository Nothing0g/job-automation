# ARCHITECTURE.md — Job Automation Studio

> **Purpose.** Job Automation Studio is a private, single-owner web application for recording applications, storing a master profile, creating factual one-page resume variants and outreach emails, exporting documents, and creating Gmail drafts that the owner must manually send. The deployed portable configuration uses Vercel, TiDB Cloud, Google OAuth/Gmail, Gemini, and optionally Groq. It deliberately does **not** store raw resume files in portable mode.

## Runtime architecture

| Layer | Exact implementation | Responsibility | Likely reason |
|---|---|---|---|
| Browser UI | React `19.2.1`, Wouter, React Query, tRPC React, Tailwind CSS 4, Radix/shadcn-style primitives | Form state, previews, dashboard, route composition, theme, file downloads | **Inferred:** typed RPC and local-first UI state keep a personal tool small without a separate REST client layer. |
| API application | Express `4.21.2`, tRPC `11.6.0`, Zod `4.1.12` | Serves Google/Gmail REST endpoints and `/api/trpc` procedures | One Express factory works both locally and inside Vercel. |
| Authorization | Google OAuth 2.0, Google ID-token verification, `jose` JWT | Allows exactly `OWNER_GOOGLE_EMAIL`; issues a signed, 12-hour owner cookie | **Inferred:** a single Google allowlist is simpler than public accounts or a password database. |
| Persistence | Drizzle ORM `0.44.5`, `mysql2`, TiDB/MySQL | Users, one master profile per user, jobs, one encrypted Gmail connection per user | TiDB is MySQL-compatible and accessible from serverless deployment. |
| AI drafting | Gemini REST (`gemini-3.6-flash`) and optional Groq OpenAI-compatible REST (`openai/gpt-oss-20b`) | Server-only grounded resume/email generation | API keys never enter browser code; provider choice is a harmless local UI preference. |
| Documents | `docx`, `jspdf`, `xlsx` | Generates DOCX/PDF in the browser for exports; generates DOCX in the server only for a Gmail attachment | Avoids permanent file storage while preserving editable export and attachment workflows. |
| Deployment | Vite client build, esbuild ESM server bundle, Vercel serverless function | Builds `dist/public` and `dist/vercel-handler.mjs`; `api/index.js` imports the latter | **Inferred:** avoids long-running servers and keeps the app self-hostable on Vercel. |

## High-level system diagram

```text
┌──────────────────────────────────────────────────────────────────┐
│ Browser: React SPA                                                 │
│ App.tsx → PortableOwnerAccess → DashboardLayout → pages           │
│  │             │                         │                        │
│  │             │ GET /api/portable/auth/status                    │
│  └─────────────┴── tRPC React client → POST /api/trpc/*           │
│                                    │                               │
│                                    ▼                               │
│ Vercel Function: api/index.js → dist/vercel-handler.mjs           │
│                    createApiApp()                                  │
│              ┌─────────────┴─────────────────┐                    │
│              ▼                               ▼                    │
│    Portable REST routes                  tRPC appRouter           │
│    Google/Gmail OAuth,                   profile/jobs/drafting    │
│    attached Gmail drafts                        │                  │
│              │                                │                   │
│              ▼                                ▼                   │
│ Google OAuth / Gmail API              db.ts → Drizzle → TiDB      │
│                      ┌─────────────────────────────────┐          │
│                      ▼                                 ▼          │
│              Gmail draft created             Gemini or Groq API    │
│              (never sent)                    grounded text only    │
└──────────────────────────────────────────────────────────────────┘
```

## Boot and request lifecycle

`api/index.js` is the Vercel entry shim. It default-imports `../dist/vercel-handler.mjs`. `server/vercel/handler.ts` lazily calls `createApiApp()` once, adds production static-file serving after API routes, and emits a generic JSON `500` if bootstrap fails. `server/_core/index.ts` is the local Node entrypoint; it creates the same API app and installs development static/Vite handling.

`server/_core/app.ts:createApiApp()` creates Express, installs 50 MB JSON and URL-encoded parsers, calls `registerStorageProxy(app)`, conditionally loads legacy Manus OAuth only when `portableAuthEnabled()` is false, registers portable REST routes, and mounts `createExpressMiddleware({ router: appRouter, createContext })` at `/api/trpc`.

## Route map

| Browser route | Component | Primary API usage |
|---|---|---|
| `/` | `JobsDashboard` inside `DashboardLayout` | `jobs.list`, `jobs.create`, `jobs.generateDrafts`, `jobs.importPublicLink`, `profile.get` |
| `/discover` | `JobDiscoveryPage` | Pure client-side `buildJobBoardSearchUrl` links; no listing scraping in the deployed redirect-first flow |
| `/profile` | `MasterProfilePage` | `profile.get`, `profile.save`, conditionally `profile.uploadPdf` |
| `/jobs/:id` | `JobWorkspace` | `jobs.get/update/generateDrafts/setResumeApproval`, `drafting.providers`, Gmail REST actions |
| fallback | `NotFound` | None |

## Source catalogue

The repository has two kinds of source files. Application-specific files carry product behavior; `client/src/components/ui/*.tsx` are reusable Radix/shadcn-style primitives. A rebuild must retain both sets because application pages import their exact component modules.

| Area | Files and purpose |
|---|---|
| Deployment/configuration | `package.json` scripts/dependency lock; `vercel.json` deploy rewrites/build; `vite.config.ts` Vite aliases/output/debug collector; `tsconfig.json` strict path aliases; `drizzle.config.ts` MySQL migration config; `api/index.js` Vercel import shim. |
| Database | `drizzle/schema.ts` MySQL tables/types; `drizzle/relations.ts` generated relation metadata; `drizzle/meta/*.json` Drizzle schema snapshots/journal. |
| Server composition | `server/_core/app.ts` API factory; `index.ts` local listener; `context.ts` request context; `trpc.ts` router/procedure setup; `static.ts` production assets; `vite.ts` development Vite middleware. |
| Server product contract | `server/routers.ts` complete tRPC surface; `server/db.ts` scoped persistence. |
| Server domain helpers | `server/lib/aiPrompts.ts`, `draftQuality.ts`, `emailDraft.ts`, `emailSignature.ts`, `jobPosting.ts`, `jobTracker.ts`, `onePageResume.ts`, `personalWorkspace.ts`, `sheetImport.ts`. |
| Portable security/integrations | `server/portable/config.ts`, `cookies.ts`, `ownerSession.ts`, `routes.ts`, `googleOAuth.ts`, `encryption.ts`, `gmailDraft.ts`, `resumeAttachment.ts`, `tidbTls.ts`, `drafting.ts`, `gemini.ts`, `groq.ts`, `filePolicy.ts`, `objectStorage.ts`. |
| Legacy/managed adapters | `server/_core/oauth.ts`, `llm.ts`, `storageProxy.ts`, `dataApi.ts`, `storage.ts`, `heartbeat.ts`, `imageGeneration.ts`, `map.ts`, `notification.ts`, `voiceTranscription.ts`, `systemRouter.ts`, `sdk.ts`; these support the starter’s non-portable Manus runtime and are bypassed by `PORTABLE_AUTH_ENABLED=true` except where explicitly called. |
| Client composition | `client/src/main.tsx` React mount; `App.tsx` providers/routes; `contexts/ThemeContext.tsx`; `_core/hooks/useAuth.ts`; `lib/trpc.ts`; `const.ts`; `index.css`. |
| Client pages | `JobsDashboard.tsx` intake/tracker; `JobWorkspace.tsx` drafting/review/export; `MasterProfilePage.tsx` profile; `JobDiscoveryPage.tsx` board links; `Home.tsx`, `NotFound.tsx`, `ComponentShowcase.tsx`. |
| Client product components | `DashboardLayout.tsx`, `DashboardLayoutSkeleton.tsx`, `PortableOwnerAccess.tsx`, `GmailComposeAction.tsx`, `GmailDraftAttachmentAction.tsx`, `ErrorBoundary.tsx`, `ManusDialog.tsx`, `AIChatBox.tsx`, `Map.tsx`. |
| Client utilities | `documentExport.ts`, `emailDraft.ts`, `gmailCompose.ts`, `intakeFallback.ts`, `jobDiscovery.ts`, `portableRuntime.ts`, `reminders.ts`, `trackerExport.ts`, `utils.ts`, plus `useComposition.ts`, `useMobile.tsx`, `usePersistFn.ts`. |
| Tests/docs | Every `*.test.ts(x)` validates its adjacent contract; existing `docs/*.md` retain historical research, migration, deployment, provider, and QA evidence. |

### UI primitive catalogue

`client/src/components/ui/` contains `accordion`, `alert-dialog`, `alert`, `aspect-ratio`, `avatar`, `badge`, `breadcrumb`, `button-group`, `button`, `calendar`, `card`, `carousel`, `chart`, `checkbox`, `collapsible`, `command`, `context-menu`, `dialog`, `drawer`, `dropdown-menu`, `empty`, `field`, `form`, `hover-card`, `input-group`, `input-otp`, `input`, `item`, `kbd`, `label`, `menubar`, `navigation-menu`, `pagination`, `popover`, `progress`, `radio-group`, `resizable`, `scroll-area`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `slider`, `sonner`, `spinner`, `switch`, `table`, `tabs`, `textarea`, `toggle-group`, `toggle`, and `tooltip`. They are conventional controlled React/Radix wrappers with no business persistence or external calls; their side effect is only rendering and event delegation. `button.tsx`, `input.tsx`, `textarea.tsx`, `label.tsx`, `select.tsx`, `tooltip.tsx`, and `sonner.tsx` are directly used by product screens.

## Non-negotiable reconstruction invariants

1. Keep `GEMINI_API_KEY` and `GROQ_API_KEY` server-only. No `VITE_GEMINI_API_KEY` or `VITE_GROQ_API_KEY` may exist.
2. In portable mode, every workspace route and tRPC procedure requires the owner Google account; do not fall back to anonymous access.
3. Gmail integration creates **drafts only**. Never call Gmail send endpoints.
4. Generate only from `master_profiles.resumeText` and `personalBio`. Prompts and validations must reject invented achievements.
5. A resume cannot be exported or attached until it is one-page compliant and has a persisted approval timestamp.
6. Portable mode requires pasted resume text and blocks raw source-resume storage.

## Exhaustive first-party file ledger

The following ledger is deliberately path-by-path rather than grouped. Dependency lockfiles and generated `node_modules` are excluded; all tracked project configuration, runtime source, test source, migration metadata, and project documentation are included.

| Path | One-line reconstruction purpose |
|---|---|
| `api/index.js` | Vercel CommonJS/ESM-compatible entry shim that default-exports the bundled server handler. |
| `client/index.html` | Vite HTML shell and root mount element. |
| `client/public/.gitkeep` | Keeps the otherwise empty public directory tracked. |
| `client/public/__manus__/debug-collector.js` | Development diagnostic collector injected by Vite plugin. |
| `client/public/__manus__/version.json` | Build/debug version metadata. |
| `client/src/main.tsx` | Creates React root and renders `App`. |
| `client/src/App.tsx` | Registers routes/providers/error boundary and portable owner gate. |
| `client/src/index.css` | Tailwind import plus light/dark tokens and global visual language. |
| `client/src/const.ts` | Re-exports shared cookie constants and starts legacy login navigation. |
| `client/src/_core/hooks/useAuth.ts` | Legacy tRPC-based auth state hook. |
| `client/src/contexts/ThemeContext.tsx` | Persists and provides light/dark theme state. |
| `client/src/hooks/useComposition.ts` | Generic composable callback/event hook. |
| `client/src/hooks/useMobile.tsx` | Browser media-query mobile breakpoint hook. |
| `client/src/hooks/usePersistFn.ts` | Stable latest-function reference hook. |
| `client/src/lib/trpc.ts` | Typed `createTRPCReact<AppRouter>()` client export. |
| `client/src/lib/utils.ts` | `cn()` Tailwind class merger. |
| `client/src/lib/documentExport.ts` | Resume/email cleanup, pagination check, DOCX/PDF creation and download. |
| `client/src/lib/emailDraft.ts` | Client display cleanup of inherited email wrappers. |
| `client/src/lib/gmailCompose.ts` | Gmail web-compose URL and recipient guidance. |
| `client/src/lib/intakeFallback.ts` | Applies pasted manual job context and validates its sufficiency. |
| `client/src/lib/jobDiscovery.ts` | Trusted-board metadata and role/location/recency redirect links. |
| `client/src/lib/portableRuntime.ts` | Client-side portable file-upload capability flag. |
| `client/src/lib/reminders.ts` | Follow-up grouping by date. |
| `client/src/lib/trackerExport.ts` | Excel row/workbook construction and browser download. |
| `client/src/pages/Home.tsx` | Initial landing/dashboard entry redirect/presentation. |
| `client/src/pages/JobsDashboard.tsx` | Application list, tracker, intake dialog, draft generation initiation. |
| `client/src/pages/JobWorkspace.tsx` | Job editing, provider selection, preview, approval, export, Gmail actions. |
| `client/src/pages/MasterProfilePage.tsx` | Master-resume/bio/signature/contact-link editing. |
| `client/src/pages/JobDiscoveryPage.tsx` | Search-link discovery form and specialist board cards. |
| `client/src/pages/NotFound.tsx` | Unknown-route page. |
| `client/src/pages/ComponentShowcase.tsx` | Template UI-component demonstration route. |
| `client/src/components/PortableOwnerAccess.tsx` | Status fetch plus browser sign-in gate. |
| `client/src/components/DashboardLayout.tsx` | Sidebar/top-level personal-workspace layout/navigation. |
| `client/src/components/DashboardLayoutSkeleton.tsx` | Dashboard loading placeholder. |
| `client/src/components/GmailComposeAction.tsx` | Manual Gmail compose button component. |
| `client/src/components/GmailDraftAttachmentAction.tsx` | Attached Gmail-draft creation button/component. |
| `client/src/components/ErrorBoundary.tsx` | React render-failure boundary. |
| `client/src/components/ManusDialog.tsx` | Reusable application dialog wrapper. |
| `client/src/components/AIChatBox.tsx` | Template chat component; not core job workflow. |
| `client/src/components/Map.tsx` | Template Google Maps client component; not core job workflow. |
| `client/src/components/ui/accordion.tsx` | Accordion primitive exports. |
| `client/src/components/ui/alert-dialog.tsx` | Alert dialog primitive exports. |
| `client/src/components/ui/alert.tsx` | Alert surface/title/description exports. |
| `client/src/components/ui/aspect-ratio.tsx` | Aspect ratio primitive export. |
| `client/src/components/ui/avatar.tsx` | Avatar/image/fallback exports. |
| `client/src/components/ui/badge.tsx` | Badge and variant export. |
| `client/src/components/ui/breadcrumb.tsx` | Breadcrumb primitives. |
| `client/src/components/ui/button-group.tsx` | Grouped button primitives. |
| `client/src/components/ui/button.tsx` | Button and visual variant exports. |
| `client/src/components/ui/calendar.tsx` | Calendar and day-button exports. |
| `client/src/components/ui/card.tsx` | Card layout primitives. |
| `client/src/components/ui/carousel.tsx` | Carousel primitives/hook exports. |
| `client/src/components/ui/chart.tsx` | Chart context/container/tooltip/legend primitives. |
| `client/src/components/ui/checkbox.tsx` | Checkbox primitive export. |
| `client/src/components/ui/collapsible.tsx` | Collapsible primitives. |
| `client/src/components/ui/command.tsx` | Command palette primitives. |
| `client/src/components/ui/context-menu.tsx` | Context-menu primitives. |
| `client/src/components/ui/dialog.tsx` | Dialog primitives plus composition hook. |
| `client/src/components/ui/drawer.tsx` | Drawer primitives. |
| `client/src/components/ui/dropdown-menu.tsx` | Dropdown-menu primitives. |
| `client/src/components/ui/empty.tsx` | Empty-state primitives. |
| `client/src/components/ui/field.tsx` | Form-field composition primitives. |
| `client/src/components/ui/form.tsx` | React Hook Form layout/control primitives. |
| `client/src/components/ui/hover-card.tsx` | Hover-card primitives. |
| `client/src/components/ui/input-group.tsx` | Input-group primitives. |
| `client/src/components/ui/input-otp.tsx` | OTP input primitives. |
| `client/src/components/ui/input.tsx` | Styled native input. |
| `client/src/components/ui/item.tsx` | Item/list primitive set. |
| `client/src/components/ui/kbd.tsx` | Keyboard hint primitives. |
| `client/src/components/ui/label.tsx` | Label primitive. |
| `client/src/components/ui/menubar.tsx` | Menubar primitives. |
| `client/src/components/ui/navigation-menu.tsx` | Navigation-menu primitives. |
| `client/src/components/ui/pagination.tsx` | Pagination primitives. |
| `client/src/components/ui/popover.tsx` | Popover primitives. |
| `client/src/components/ui/progress.tsx` | Progress primitive. |
| `client/src/components/ui/radio-group.tsx` | Radio-group primitives. |
| `client/src/components/ui/resizable.tsx` | Resizable-panel primitives. |
| `client/src/components/ui/scroll-area.tsx` | Scroll area/bar primitives. |
| `client/src/components/ui/select.tsx` | Select primitives. |
| `client/src/components/ui/separator.tsx` | Separator primitive. |
| `client/src/components/ui/sheet.tsx` | Sheet primitives. |
| `client/src/components/ui/sidebar.tsx` | Sidebar provider/layout/menu primitives. |
| `client/src/components/ui/skeleton.tsx` | Skeleton primitive. |
| `client/src/components/ui/slider.tsx` | Slider primitive. |
| `client/src/components/ui/sonner.tsx` | Toaster wrapper. |
| `client/src/components/ui/spinner.tsx` | Spinner primitive. |
| `client/src/components/ui/switch.tsx` | Switch primitive. |
| `client/src/components/ui/table.tsx` | Table primitives. |
| `client/src/components/ui/tabs.tsx` | Tabs primitives. |
| `client/src/components/ui/textarea.tsx` | Styled textarea. |
| `client/src/components/ui/toggle-group.tsx` | Toggle-group primitives. |
| `client/src/components/ui/toggle.tsx` | Toggle and variants. |
| `client/src/components/ui/tooltip.tsx` | Tooltip/provider primitives. |
| `drizzle/schema.ts` | Canonical table declarations, enums and inferred types. |
| `drizzle/relations.ts` | Generated/empty relation placeholder. |
| `drizzle.config.ts` | Drizzle migration configuration/TiDB credentials. |
| `drizzle/meta/_journal.json` | Drizzle migration journal. |
| `drizzle/migrations/.gitkeep` | Keeps migrations directory tracked. |
| `server/_core/app.ts` | Portable-aware Express app factory. |
| `server/_core/index.ts` | Local server process listener. |
| `server/_core/context.ts` | Builds tRPC request context/user from session. |
| `server/_core/trpc.ts` | tRPC init, public/protected/admin procedures. |
| `server/_core/cookies.ts` | Legacy session-cookie options. |
| `server/_core/env.ts` | Legacy/runtime environment projection. |
| `server/_core/static.ts` | Built static asset serving. |
| `server/_core/vite.ts` | Development Vite middleware/HTML transform. |
| `server/_core/oauth.ts` | Legacy Manus OAuth routes, conditionally imported only outside portable mode. |
| `server/_core/sdk.ts` | Legacy Manus SDK/identity client. |
| `server/_core/llm.ts` | Legacy Forge model invocation/catalogue contract. |
| `server/_core/storageProxy.ts` | Legacy storage upload/download proxy route registration. |
| `server/_core/dataApi.ts` | Legacy authenticated data-API caller. |
| `server/_core/heartbeat.ts` | Heartbeat scheduled-job CRUD client. |
| `server/_core/imageGeneration.ts` | Legacy image-generation API client. |
| `server/_core/map.ts` | Legacy Google-map proxy/request types. |
| `server/_core/notification.ts` | Legacy owner-notification API client. |
| `server/_core/voiceTranscription.ts` | Legacy audio transcription API client. |
| `server/_core/systemRouter.ts` | Legacy/system tRPC routes. |
| `server/_core/types/cookie.d.ts` | Cookie request typing augmentation. |
| `server/_core/types/manusTypes.ts` | Legacy Manus authorization DTOs. |
| `server/db.ts` | Owner-scoped Drizzle persistence helpers. |
| `server/routers.ts` | Product tRPC contract and generation orchestration. |
| `server/storage.ts` | Legacy Forge/optional S3 storage adapter. |
| `server/vercel/handler.ts` | Lazy Vercel Express/static handler. |
| `server/lib/aiPrompts.ts` | Grounded prompt constructors. |
| `server/lib/draftQuality.ts` | Resume/email completeness heuristics. |
| `server/lib/emailDraft.ts` | Server draft display/storage cleanup. |
| `server/lib/emailSignature.ts` | Email signature append helper. |
| `server/lib/jobPosting.ts` | Safe public posting validation/fetch/extraction. |
| `server/lib/jobTracker.ts` | Follow-up date parser. |
| `server/lib/onePageResume.ts` | Server one-page estimate. |
| `server/lib/personalWorkspace.ts` | Legacy durable personal-user creation. |
| `server/lib/sheetImport.ts` | Legacy Google Sheet CSV parser/import URL helper. |
| `server/portable/config.ts` | Portable env parsing/configuration. |
| `server/portable/cookies.ts` | Defensive cookie parser. |
| `server/portable/drafting.ts` | Explicit Gemini/Groq selection. |
| `server/portable/encryption.ts` | AES-GCM Gmail refresh-token encryption. |
| `server/portable/filePolicy.ts` | Portable raw-file prohibition. |
| `server/portable/gemini.ts` | Gemini REST adapter. |
| `server/portable/groq.ts` | Groq REST adapter. |
| `server/portable/gmailDraft.ts` | MIME builder/Gmail draft client/eligibility. |
| `server/portable/googleOAuth.ts` | Google authorization, code exchange, refresh. |
| `server/portable/objectStorage.ts` | Optional portable S3-compatible config/key helper. |
| `server/portable/ownerSession.ts` | Google identity allowlist and owner JWT. |
| `server/portable/resumeAttachment.ts` | Approved DOCX attachment generation. |
| `server/portable/routes.ts` | Portable OAuth/Gmail HTTP endpoints. |
| `server/portable/tidbTls.ts` | TiDB TLS database URL parser. |
| `shared/const.ts` | Legacy auth constants/OAuth state encode/decode. |
| `shared/types.ts` | Re-exports Drizzle types. |
| `shared/_core/errors.ts` | `HttpError` and HTTP error constructors. |
| `package.json` / `pnpm-lock.yaml` | Exact dependency/package-manager contract. |
| `vite.config.ts` / `vite.config.ts.bak` | Active Vite config and saved prior copy. |
| `tsconfig.json` / `vitest.config.ts` | Compiler and test-runner settings. |
| `vercel.json` | Serverless build, inclusion and routing configuration. |
| `.gitignore`, `.prettierignore`, `.prettierrc`, `components.json`, `template.json`, `.project-config.json` | Repository hygiene, formatter, shadcn/template and project metadata. |
| `server/**/*.test.ts`, `server/**/*.test.tsx`, `client/src/**/*.test.ts`, `client/src/**/*.test.tsx` | Unit/regression tests paired with the behaviorally named module; test files have no production side effects. |
| `docs/*.md` | Historical portable migration, provider, OAuth, verification and QA evidence; the seven reconstruction guides are this document set. |
