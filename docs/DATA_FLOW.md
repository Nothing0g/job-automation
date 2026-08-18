# DATA_FLOW.md — End-to-end user workflows

## 1. Owner sign-in and workspace authorization

| Step | File/function | Input → output / failure path |
|---|---|---|
| 1 | `client/src/App.tsx` → `PortableOwnerAccess` | App routes are wrapped by the portable gate. |
| 2 | `usePortableStatus()` | Browser `fetch("/api/portable/auth/status", { credentials:"include" })`; a fetch failure fails open only to `{ enabled:false, signedIn:true }` so non-portable/dev mode remains usable. |
| 3 | `server/portable/routes.ts:GET /api/portable/auth/status` | `requirePortable()` returns config or 404/503. It checks `job_automation_owner` with `verifyOwnerSession()`. Invalid/missing/wrong email returns `{enabled:true,signedIn:false}`; valid session upserts owner and returns Gmail connection status. |
| 4 | `PortableOwnerAccess` | If enabled and not signed in, renders sign-in control to `/api/portable/auth/google`; it does not render workspace pages. |
| 5 | `GET /api/portable/auth/google` | `randomBytes(32)` → state cookie → `googleAuthorizationUrl(...gmail:false)` redirect. |
| 6 | Google callback → `GET /api/portable/auth/google/callback` | `equalState()` rejects altered/missing state with 400. `exchangeGoogleCode()` exchanges code. `verifyGoogleOwnerToken()` checks Google signature/JWKS, issuer, client audience, email verification and exact allowlist. Any failure is 403. |
| 7 | `getOrCreatePortableOwner` + `createOwnerSession` | Durable admin user is created/refreshed; signed 12-h JWT cookie is set; browser redirects `/` and repeats step 2 successfully. |

**Security property:** the REST route and `portableOwnerProcedure` both gate access. A person who bypasses the React screen still receives tRPC `UNAUTHORIZED` without the owner session.

## 2. Save master profile

| Step | File/function | Input → output / failure path |
|---|---|---|
| 1 | `MasterProfilePage` | Loads `trpc.profile.get`; initializes editable resume text, bio, signature, links. |
| 2 | User submits profile form | Page calls `trpc.profile.save.mutate({ resumeText, personalBio, emailSignature, contactLinks })`. |
| 3 | `appRouter.profile.save` | `portableOwnerProcedure` → `personalUser(ctx.user)`. Zod caps text fields and validates links. Invalid email/URL/size is a typed procedure error. |
| 4 | `contactLinksFromStored` / `db.saveMasterProfile` | Links become JSON; one row is inserted or updated using the unique `userId`. Returned row is decoded for the UI. |
| 5 | Browser result | Mutation success toast and query refresh; these values become the only authoritative AI source and resume-header links. |

`profile.uploadPdf` is a legacy branch. It validates MIME/name, PDF magic bytes, and 8 MB maximum, then `storagePut`s only when `portableRawResumeFilesAllowed()`. In portable mode it fails before upload with a deliberate instruction to paste factual text instead.

## 3. Create a job and generate grounded drafts

```text
JobsDashboard / StartApplicationDialog
  → jobs.create
  → JobsDashboard calls jobs.generateDrafts(newJob.id, selected provider)
  → navigation to /jobs/:id
  → JobWorkspace renders resume/email preview
```

| Step | Exact function/path | Details and failure handling |
|---|---|---|
| 1 | `StartApplicationDialog` | Supports Full Details, No JD Mode, and public-link import/fallback input. It collects company, role, context, recipient, source/tracker fields. |
| 2 | `appRouter.jobs.create` | `createJobSchema` trims/limits company and role, validates URLs/status/date, requires a valid recipient, and requires a 40-character job description when `contextMode === "full"`. Invalid input never reaches SQL. |
| 3 | `db.createJob` | Inserts `jobs` row with nullable normalized fields and reloads it with owner scope. |
| 4 | `appRouter.jobs.generateDrafts` | Fetches master profile/job concurrently. Missing job → `NOT_FOUND`; missing pasted master text in portable mode → `BAD_REQUEST`. |
| 5 | Prompt selection | Full: `buildResumeMessages` plus `buildEmailMessages`; limited: `buildRoleBasedResumeMessages` plus `buildLimitedContextEmailMessages`. `sourceParts()` includes master resume, bio, job context; only non-portable mode can attach a signed PDF URL. |
| 6 | Concurrent model work | `Promise.all([generateOnePageResume(...), generateOutreachEmail(...)])`. Model choice originates in `JobWorkspace` local storage and flows as `provider`. |
| 7 | Provider dispatch | `generateDraftText` reads server secrets. `generatePortableDraftText` calls Gemini by default or Groq when explicitly selected. Network/401/403/429/empty-response errors become `PRECONDITION_FAILED` and no job drafts are written. |
| 8 | Resume safety loop | `generateOnePageResume` invokes `resumeFitsOnePage`. It makes up to two shortening calls. `resumeDraftQualityIssue` may trigger a completeness regeneration plus shortening; remaining violation rejects without persistence. |
| 9 | Email safety loop | `generateOutreachEmail` invokes `outreachDraftQualityIssue`, makes one targeted regeneration when needed, then rejects if still too generic/incomplete. |
| 10 | Persist | `cleanEmailDraft` removes display artifacts; `appendEmailSignature` adds stored signature. `db.updateJobForUser` saves resume/email and sets `tailoredResumeApprovedAt:null`. |
| 11 | UI | React Query invalidates list/get. `JobWorkspace` shows content but keeps export/attachment disabled until owner approves saved, one-page version. |

**Rate-limit path:** Gemini/Groq HTTP 429 messages are intentionally shown to the owner; no silent provider switch or partial draft persistence occurs. The owner may select the other configured provider and retry.

## 4. Review, approve, export, and manually compose email

| Step | Exact function/path | Details and error path |
|---|---|---|
| 1 | `JobWorkspace` local `WorkspaceForm` | Displays clean `ResumePreview` from `resumeHeader()` and parsed blocks. `resumeHasUnsavedEdits` compares form text to stored job. |
| 2 | Optional manual edit → `jobs.update` | Router resets approval if `tailoredResume`, company, role, description, or mode changed. It returns `NOT_FOUND` if owner no longer owns/has job. |
| 3 | `jobs.setResumeApproval({approved:true})` | Server re-loads job; rejects empty resume or `!resumeFitsOnePage`. On success writes current timestamp. |
| 4 | `ExportActions` | Client enables copy/text/DOCX/PDF only when content exists and approved. `exportDocx()` / `exportPdf()` regenerate document locally, with cleaned headings/fences/dividers and contact hyperlinks. Export exceptions show a toast, not a server error. |
| 5 | `GmailComposeAction` | `buildGmailComposeUrl({to,subject,body})` opens Gmail web compose in a new tab. It pre-fills where possible; user must review and click Gmail’s Send themselves. |

## 5. Connect Gmail and create an attached draft

| Step | Exact function/path | Details and error path |
|---|---|---|
| 1 | `GmailDraftAttachmentAction` | Eligibility passed from workspace: approved resume, recipient, email draft, no unsaved changed recipient/email/resume. |
| 2 | `GET /api/portable/gmail/connect` / callback | Owner session + OAuth state protects consent. Callback requires Google refresh token and owner-match identity; stores AES-GCM encrypted token. |
| 3 | Component POST | Same-origin `POST /api/portable/gmail/drafts/:jobId`, cookies included. |
| 4 | `requireOwner` and `sameOrigin` | Invalid owner: 401; mismatched Origin: 403. |
| 5 | `isEligibleForApprovedResumeDraft` | Rejects 400 if recipient, email body, generated resume, or approval timestamp missing. Gmail missing: 409. |
| 6 | `createApprovedResumeDocx` | Rebuilds DOCX transiently from approved resume and `master_profiles.contactLinks`; `approvedResumeFilename(company,role)` returns a slugged filename. |
| 7 | `gmailAccessToken` + `createDraftOnly` | Refreshes OAuth access token, creates MIME `multipart/mixed`, calls Gmail drafts endpoint. Success returns draft/message IDs with 201. Any failure returns 502. |
| 8 | User final action | Gmail shows a draft with attachment. The app does not send it; the owner controls final send. |

## Additional flows retained in the codebase

`jobs.importPublicLink` validates an HTTPS/HTTP URL and calls `fetchPublicJobPosting`; public pages that block/server-render insufficient content surface a `BAD_REQUEST` with fallback guidance. `JobDiscoveryPage` is deliberately redirect-first: `buildJobBoardSearchUrl` opens trusted board searches for role, optional location, and freshness rather than ingesting third-party listings. `trackerExport.ts` serializes current tracker data to an `.xlsx` download; `reminders.ts` classifies overdue/due-today/upcoming/unscheduled follow-ups from `followUpAt`.
