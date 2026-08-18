# SCHEMA.md — Persistent and client state

## Database dialect and conventions

`drizzle/schema.ts` defines MySQL tables; production uses TiDB Cloud through the MySQL driver. `server/db.ts` always selects or updates profiles, jobs, and Gmail connections with their `userId`, so rows are owner-scoped. All four tables use database-managed timestamp fields.

| Table | Primary key | Cardinality | Purpose |
|---|---|---|---|
| `users` | `id` | 1 → 0..1 profile, 0..N jobs, 0..1 Gmail connection | Durable identity. |
| `master_profiles` | `id` | N → 1 `users.id` | Factual master resume and reusable contact data. |
| `jobs` | `id` | N → 1 `users.id` | One application and its generated/approved content. |
| `gmail_connections` | `id` | N → 1 `users.id` | Encrypted refresh token used only to create Gmail drafts. |

## `users`

| Column | Definition | Rules |
|---|---|---|
| `id` | `int().autoincrement().primaryKey()` | Surrogate primary key. |
| `openId` | `varchar(64).notNull().unique()` | Portable mode: `portable-google:${normalizedEmail}`. |
| `name` | `text()` | Nullable Google/legacy name. |
| `email` | `varchar(320)` | Nullable; portable implementation stores lowercase allowlisted email. |
| `loginMethod` | `varchar(64)` | Portable owner value is `google`. |
| `role` | `mysqlEnum(["user", "admin"]).default("user").notNull()` | Portable owner is inserted/updated as `admin`. |
| `createdAt` | `timestamp().defaultNow().notNull()` | Creation time. |
| `updatedAt` | `timestamp().defaultNow().onUpdateNow().notNull()` | Database update time. |
| `lastSignedIn` | `timestamp().defaultNow().notNull()` | Explicitly refreshed by `upsertUser` and `getOrCreatePortableOwner`. |

## `master_profiles`

| Column | Definition | Rules |
|---|---|---|
| `id` | Auto-increment integer primary key | Profile id. |
| `userId` | Non-null FK to `users.id`, `onDelete: "cascade"` | Unique index `master_profiles_user_unique` enforces one profile per user. |
| `resumeText` | Nullable `text` | Portable mode must contain non-empty trimmed text before generation. tRPC accepts ≤100,000 characters. |
| `resumeFileKey` | Nullable `varchar(512)` | Legacy/non-portable object-storage key. Portable mode rejects original-resume upload. |
| `personalBio` | Nullable `text` | Optional factual context; tRPC accepts ≤20,000 characters. |
| `emailSignature` | Nullable `text` | Optional, tRPC accepts ≤6,000 characters; appended only after email quality validation. |
| `contactLinks` | Nullable `text` | JSON-encoded `ContactLinks`; decoded defensively to empty values if invalid. |
| `createdAt`, `updatedAt` | Timestamps | Standard create/update timestamps. |

### `ContactLinks` serialized shape

```ts
type ContactLinks = {
  email: string;      // "" or valid email, max 320
  phone: string;      // max 80
  linkedin: string;   // "" or absolute URL, max 1,000
  github: string;     // "" or absolute URL, max 1,000
  portfolio: string;  // "" or absolute URL, max 1,000
};
```

The Zod `contactLinksSchema` requires `email` to be either `""` or an email and social values to be either `""` or `.url()`. It is persisted as `JSON.stringify(contactLinks)`, not normalized SQL columns.

## `jobs`

| Column | Definition | Rules |
|---|---|---|
| `id` | Auto-increment integer primary key | Application id. |
| `userId` | Non-null FK to `users.id`, cascade delete | Every `get`/`update` includes this ownership condition. |
| `company` | `varchar(255).notNull()` | Zod trims, requires 1–255 characters. |
| `role` | `varchar(255).notNull()` | Zod trims, requires 1–255 characters. |
| `jobDescription` | `text().notNull()` | Full context creation requires ≥40 characters; limited context allows empty string. Hard max 100,000. |
| `contextMode` | enum `"full" \| "limited"`, default `"full"` | `"limited"` means No JD Mode; resume is role-based, not JD-tailored. |
| `contactEmail` | nullable `varchar(320)` | `createJobSchema` currently requires a valid email in both modes, although persisted data may be null for legacy jobs. |
| `sourceUrl` | nullable `varchar(2000)` | tRPC accepts null or a valid URL ≤2,000. |
| `status` | enum | `"to-apply"`, `"applied"`, `"interview"`, `"offer"`, `"rejected"`; default `"to-apply"`. |
| `tailoredResume` | nullable `text` | Generated text or saved user edits. ≤100,000 on tRPC update. |
| `tailoredResumeApprovedAt` | nullable timestamp | Non-null only after stored draft is present and `resumeFitsOnePage()` returns true; reset on resume or target change/regeneration. |
| `emailDraft` | nullable `text` | Generated cleaned body; ≤40,000 on update. |
| `notes` | nullable `text` | Private workspace notes; ≤40,000 on update. |
| `nextAction` | nullable `varchar(500)` | Trimmed, 500 max; empty input becomes null. |
| `followUpAt` | nullable timestamp | Client sends `YYYY-MM-DD`; `parseFollowUpDate()` converts it to a date/null. |
| `createdAt`, `updatedAt` | timestamps | `updatedAt` changes in `updateJobForUser`. |

Indexes are `jobs_user_status_idx(userId, status)` and `jobs_user_updated_idx(userId, updatedAt)`. Listings sort by `updatedAt DESC`.

## `gmail_connections`

| Column | Definition | Rules |
|---|---|---|
| `id` | Auto-increment integer primary key | Connection id. |
| `userId` | Non-null FK to `users.id`, cascade delete | Unique index `gmail_connections_user_unique` allows exactly one connection per user. |
| `encryptedRefreshToken` | `text().notNull()` | AES-256-GCM envelope; never returned to the browser. |
| `scopes` | `text().notNull()` | Google-granted scope string from OAuth response. |
| `connectedAt`, `updatedAt` | timestamps | Saved at initial connection; `updatedAt` is refreshed by upsert. |

## Important non-database state

| Shape/location | Fields | Behavior |
|---|---|---|
| `WorkspaceForm` in `JobWorkspace.tsx` | company, role, jobDescription, contextMode, contactEmail, sourceUrl, status, notes, tailoredResume, emailDraft, nextAction, followUpAt | Editable representation of a loaded `jobs` row. `resumeHasUnsavedEdits` prevents approval/export/attachment until saved. |
| `draftProvider` localStorage key | `job-automation:draft-provider`: `"gemini" \| "groq"` | Browser preference only. It contains no key and does not prove provider availability. |
| Portable owner JWT cookie | `job_automation_owner` | `httpOnly`, `sameSite=lax`, secure on HTTPS, 12-hour HS256 JWT. |
| OAuth state cookies | `job_automation_google_state`, `job_automation_gmail_state` | Random 32-byte base64url state, `httpOnly`, 10-minute lifetime, compared with `timingSafeEqual`. |
| Gmail attachment eligibility | `isEligibleForApprovedResumeDraft(job)` | Requires non-empty recipient, email draft, resume, and `tailoredResumeApprovedAt`. |

## Relationship diagram

```text
users (1)
  ├── master_profiles (0..1)  [cascade delete; unique userId]
  ├── jobs            (0..N) [cascade delete; indexed by user/status and user/updated]
  └── gmail_connections(0..1)[cascade delete; unique userId]
```

## Data-retention boundary

In portable mode, the authoritative resume is pasted `resumeText` in TiDB. The original source file is intentionally not stored (`portableResumeTextRequired() === true`). Generated DOCX/PDF exports are browser downloads, and a Gmail attachment DOCX is reconstructed transiently from the approved `tailoredResume`; neither is persisted as file bytes.
