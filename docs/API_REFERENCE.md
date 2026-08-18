# API_REFERENCE.md — Contracts, functions, and call graph

> Types use TypeScript notation. “Caller” means the immediate application caller; browser components use `trpc.*` hooks from `client/src/lib/trpc.ts`. All tRPC procedures are mounted at `/api/trpc` through Express; transport serialization uses SuperJSON.

## HTTP endpoints

| Method/path | Handler | Input / authorization | Result and side effects | Downstream calls |
|---|---|---|---|---|
| `GET /api/portable/auth/status` | `registerPortableRoutes()` | Public; portable config/cookie read | `{ enabled, signedIn, gmailConnected }`; creates portable owner row if valid session | `portableAuthEnabled`, `portableOAuthConfig`, `verifyOwnerSession`, `getOrCreatePortableOwner`, `getGmailConnection` |
| `GET /api/portable/auth/google` | same | Portable config required | Stores 10-min owner OAuth state cookie; redirects to Google | `randomBytes`, `cookieOptions`, `googleAuthorizationUrl` |
| `GET /api/portable/auth/google/callback` | same | `code`, `state`, matching state cookie | Validates Google identity, upserts owner, sets 12-h session cookie, redirects `/`; `400` invalid state, `403` exchange/identity failure | `exchangeGoogleCode`, `verifyGoogleOwnerToken`, `getOrCreatePortableOwner`, `createOwnerSession` |
| `POST /api/portable/auth/logout` | same | No body | Clears owner cookie, `204` | `cookieOptions` |
| `GET /api/portable/gmail/connect` | same | Signed-in owner | Stores 10-min Gmail OAuth state cookie and redirects to Google | `requireOwner`, `googleAuthorizationUrl` |
| `GET /api/portable/gmail/callback` | same | Owner session, `code`, state | Encrypts refresh token, upserts `gmail_connections`, redirects `/?gmail=connected`; `400` state, `403` OAuth/identity failure | `exchangeGoogleCode`, `verifyGoogleOwnerToken`, `encryptPortableSecret`, `saveGmailConnection` |
| `POST /api/portable/gmail/drafts/:jobId` | same | Signed-in owner, same `Origin` as base URL, safe positive numeric job id | `201 { draftId, messageId }`; creates but never sends Gmail draft. `400` eligibility/id, `409` disconnected Gmail, `502` provider/document failure | `getJobForUser`, `isEligibleForApprovedResumeDraft`, `getGmailConnection`, `createApprovedResumeDocx`, `gmailAccessToken`, `createDraftOnly` |

### Portable-route internal functions

| Function | Signature / return | Behavior / caller |
|---|---|---|
| `cookies` | `(req: Request) => Record<string,string>` | Calls defensive `parseRequestCookies`; used by state/session routes. |
| `cookieOptions` | `(req) => { httpOnly, secure, sameSite:"lax", path:"/" }` | Determines secure flag from protocol/proxy header. |
| `equalState` | `(a?: string, b?: string) => boolean` | Length-checks and `timingSafeEqual`s state values. |
| `requirePortable` | `(req,res) => PortableOAuthConfig \| null` | 404 when disabled, 503 config errors; used by all portable routes. |
| `requireOwner` | `async (req,res) => {config,user} \| null` | Verifies JWT/cookie and allowlisted email; returns 401 otherwise. |
| `parseLinks` | `(value: string \| null) => ResumeContactLinks \| undefined` | Safe JSON decoder used for attachment headers. |
| `sameOrigin` | `(req, baseUrl) => boolean` | Exact Origin match for Gmail draft POST. |
| `registerPortableRoutes` | `(app: Express) => void` | Registers every REST endpoint above; called once from `createApiApp`. |

## tRPC procedures (`server/routers.ts`)

| Procedure | Input | Return / mutations | Validation and call path |
|---|---|---|---|
| `auth.me` query | none | `null` | Compatibility stub; no product sign-in screen. |
| `auth.logout` mutation | none | `{ success: true }` | Clears legacy `COOKIE_NAME`. |
| `drafting.providers` query | none; portable owner required | `{ portableMode, providers: [{id,label,configured,environmentKey}] }` | Reads `PORTABLE_AUTH_ENABLED`, `GEMINI_API_KEY`, `GROQ_API_KEY`; called by `JobWorkspace`. |
| `profile.get` query | none; owner required | profile plus decoded `ContactLinks`, or `null` | `personalUser` → `db.getMasterProfile` → `contactLinksFromStored`. |
| `profile.save` mutation | optional `resumeText≤100000`, `personalBio≤20000`, `emailSignature≤6000`, `contactLinks` | Stored profile plus decoded links, or null | Serializes links and calls `db.saveMasterProfile`. |
| `profile.uploadPdf` mutation | `{filename 1..255, mimeType, base64 16..12000000}` | saved profile | Rejects portable raw file storage; otherwise validates PDF magic/max 8 MB, `storagePut`, `saveMasterProfile`. |
| `jobs.list` query | none; owner required | Jobs ordered `updatedAt DESC` | `personalUser` → `db.listJobs`. |
| `jobs.get` query | `{id: positive integer}` | Job or undefined | `db.getJobForUser(user.id,id)`. |
| `jobs.create` mutation | `createJobSchema` | Newly inserted job | Zod company/role/URLs/status; full JD ≥40; required recipient; parses date; `db.createJob`. |
| `jobs.importPublicLink` mutation | `{url: valid URL≤2000}` | parsed posting object | `fetchPublicJobPosting`; converts thrown error to `TRPCError BAD_REQUEST`. |
| `jobs.update` mutation | id plus optional job fields/drafts/notes/tracker | Updated job | Resets approval when resume or target fields change; normalizes empty tracker values; `db.updateJobForUser`; `NOT_FOUND` if absent. |
| `jobs.setResumeApproval` mutation | `{id: positive integer, approved:boolean}` | Updated job | Requires saved resume and `resumeFitsOnePage` for approval; writes timestamp/null. |
| `jobs.generateDrafts` mutation | `{id: positive integer, provider?: "gemini"\|"groq"}` | Updated job with resume/email | Requires job/master text; full vs limited prompt branches; concurrently generates resume/email, cleans/appends signature, clears approval. |

### Router-private helpers

| Function | Signature | Return / downstream effects |
|---|---|---|
| `contactLinksFromStored` | `(value: string \| null) => ContactLinks` | Parses serialized links, returns all-empty shape on null/invalid JSON. |
| `personalUser` | `async (currentUser?: {id:number}\|null) => {id:number}` | In portable mode requires tRPC `ctx.user`; otherwise `db.getPersonalUser`; throws typed authorization/init error. |
| `portableOwnerProcedure` | `publicProcedure.use(...)` | Middleware rejecting portable unauthenticated tRPC calls. |
| `contentFrom` | `(invokeLLM result) => string` | Extracts non-empty legacy managed model response or throws. |
| `preferredModel` | `async () => string \| undefined` | Lists legacy model catalog, prefers Claude Sonnet then GPT-5. |
| `generateDraftText` | `async (messages,maxTokens,model?,provider?) => string` | Portable: calls `generatePortableDraftText` with env keys and converts errors to `PRECONDITION_FAILED`; legacy: `invokeLLM`. |
| `generateOnePageResume` | `async (model,profile,job,provider?) => string` | Builds full/role prompt, makes up to two shortening attempts, checks fit/quality, may make completeness retry, rejects unsafe result. |
| `generateOutreachEmail` | `async (messages,model,profile,job,maxTokens,provider?) => string` | Generates, checks email quality, makes one completeness retry, rejects if still poor. |

## Database API (`server/db.ts`)

| Function | Signature / returns | Side effects and callers |
|---|---|---|
| `getDb` | `async () => DrizzleDb \| null` | Lazy singleton; TLS URL parse, Drizzle init; all DB functions. |
| `upsertUser` | `async (user: InsertUser) => void` | Validates `openId`, duplicate-key upsert, assigns admin for `ENV.ownerOpenId`. Legacy auth. |
| `getUserByOpenId` | `async (openId:string) => User \| undefined` | `SELECT ... LIMIT 1`; portable owner creation. |
| `getPersonalUser` | `async () => User` | Calls `createOrReusePersonalUser`; legacy personal direct access. |
| `getOrCreatePortableOwner` | `async (email:string,name?:string\|null) => User` | Normalizes email, upserts durable admin; portable routes. |
| `getGmailConnection` | `async (userId:number) => GmailConnection \| undefined` | Reads one connection. |
| `saveGmailConnection` | `async (userId,data:{encryptedRefreshToken:string;scopes:string}) => GmailConnection\|undefined` | Unique-key upsert. |
| `getMasterProfile` | `async (userId:number) => MasterProfile\|null` | Reads one profile. |
| `saveMasterProfile` | `async (userId,data) => MasterProfile\|null` | Insert or update one profile. |
| `listJobs` | `async (userId:number) => Job[]` | Returns owner jobs newest first. |
| `getJobForUser` | `async (userId,jobId) => Job\|undefined` | Ownership-scoped lookup. |
| `createJob` | `async (userId,data) => Job\|undefined` | Inserts and reloads job. |
| `updateJobForUser` | `async (userId,jobId,data) => Job\|undefined` | Owner-scoped update with new `updatedAt`, then reload. |

## Portable configuration, auth, crypto, provider API

| Module/function/class | Signature / behavior | Calls / called by |
|---|---|---|
| `portableAuthEnabled` | `(env=process.env)=>boolean` | `env.PORTABLE_AUTH_ENABLED === "true"`; all portable gates. |
| `portableGeminiApiKey` | `(env)=>string` | Returns trimmed secret or throws; router drafting. |
| `portableGroqApiKey` | `(env)=>string\|null` | Optional key; router drafting. |
| `portableOAuthConfig` | `(env)=>PortableOAuthConfig` | Requires base URL/Google/session/encryption env; portable routes. |
| `portableRedirect` | `(config,path)=>string` | Produces two exact callback URLs; OAuth helpers. |
| `parseRequestCookies` | `(header?:string)=>Record<string,string>` | Defensive parsing of malformed cookie header; portable route `cookies`. |
| `allowlistedOwner` | `(email,ownerEmail)=>boolean` | Normalized exact equality. |
| `googleIdentityFromClaims` | `(claims,ownerEmail)=>VerifiedGoogleIdentity` | Requires `email`, `sub`, verified email and allowlist. |
| `verifyGoogleOwnerToken` | `async (idToken,{clientId,ownerEmail})=>VerifiedGoogleIdentity` | `jose.jwtVerify` against Google JWKS/audience/issuer. |
| `createOwnerSession` | `async (identity,secret)=>Promise<string>` | HS256 12-hour JWT. |
| `verifyOwnerSession` | `async (token,secret)=>Promise<OwnerSession\|null>` | Validates JWT issuer/audience and claims. |
| `encryptPortableSecret` / `decryptPortableSecret` | `(plaintext/key) => string`, `(ciphertext/key)=>string` | AES-256-GCM Base64 envelope; Gmail refresh token only. |
| `googleAuthorizationUrl` | `(config,{state,gmail})=>string` | Google authorization URL with owner or Gmail scopes. |
| `exchangeGoogleCode` | `async (config,code,gmail)=>OAuthTokenResponse` | OAuth token POST, returns access/id/refresh/scope fields. |
| `gmailAccessToken` | `async (config,encryptedRefreshToken)=>string` | Decrypts then refreshes access token. |
| `GeminiProviderError`, `GroqProviderError` | `class extends Error` | Typed human-safe provider failures. |
| `generateGeminiText` | `async ({apiKey,messages,maxOutputTokens,fetchImpl?})=>string` | Gemini REST; see `EXTERNAL_SERVICES.md`. |
| `generateGroqText` | `async ({apiKey,messages,maxOutputTokens,fetchImpl?})=>string` | Groq REST; see `EXTERNAL_SERVICES.md`. |
| `generatePortableDraftText` | `async (DraftRequest, optional providers)=>string` | Dispatches explicit Groq or default Gemini. |
| `portableRawResumeFilesAllowed` / `portableResumeTextRequired` | `()=>boolean` | Inverses of portable auth; upload/generation policy. |
| `getTiDbCertificateVerifiedCredentials` | `(databaseUrl)=>mysql2 credentials\|null` | Parses TiDB URL/TLS; runtime and Drizzle migration config. |

## Domain helper API

| Module | Exported functions and purpose |
|---|---|
| `lib/aiPrompts.ts` | `buildResumeMessages`, `buildRoleBasedResumeMessages`, `buildResumeShorteningMessages`, `buildEmailMessages`, `buildLimitedContextEmailMessages`, `buildResumeCompletenessMessages`, `buildEmailCompletenessMessages` each return `Message[]`; `sourceParts` and `groundingRules` are private. All feed `generateDraftText`. |
| `lib/draftQuality.ts` | `resumeDraftQualityIssue(draft,masterResume)` returns issue/null after scaled-length and supported-section checks; `outreachDraftQualityIssue(draft,resume,bio,job)` returns issue/null after length/company/role/greeting/source-anchor checks. Router uses both. |
| `lib/onePageResume.ts` | `resumeFitsOnePage(resume)` estimates fixed layout fit; router and workspace approval gate use it. |
| `lib/emailDraft.ts` | `cleanEmailDraft(draft)` removes wrappers/fences/dividers; `cleanEmailDraftForDisplay` client counterpart. |
| `lib/emailSignature.ts` | `appendEmailSignature(email,signature)` appends non-duplicated saved signature. |
| `lib/jobTracker.ts` | `parseFollowUpDate(value)` produces `Date\|null`; tracker procedure calls it. |
| `lib/jobPosting.ts` | `fetchPublicJobPosting(url)` safely fetches/extracts a public posting or throws explanatory import error. |
| `lib/personalWorkspace.ts` | `createOrReusePersonalUser({ownerOpenId,find,create})` creates/reuses legacy owner record. |
| `lib/sheetImport.ts` | Sheet import parsing helpers retained from the initial implementation; no portable UI flow depends on them. |

## Client public functions/components

| File | Exported interface / purpose |
|---|---|
| `main.tsx` | React root mount. |
| `App.tsx` | Route/provider composition. |
| `PortableOwnerAccess.tsx` | `usePortableStatus()` fetches REST status; `PortableOwnerAccess` gates route tree with sign-in UI. |
| `GmailComposeAction.tsx` | Opens `composeUrl` in a new tab; callback confirms manual review/send. |
| `GmailDraftAttachmentAction.tsx` | POSTs attached-draft endpoint only when eligible; displays connected/error state. |
| `pages/JobsDashboard.tsx` | `JobsDashboard` and `StartApplicationDialog`; creates job, then invokes `jobs.generateDrafts`, then navigates workspace. |
| `pages/JobWorkspace.tsx` | `JobWorkspace`, `ExportActions`, `ResumePreview`; provider localStorage, drafting, editing, approval, exports, Gmail actions. |
| `pages/MasterProfilePage.tsx` | `MasterProfilePage`; profile form/read/save/upload feedback. |
| `pages/JobDiscoveryPage.tsx` | `JobDiscoveryPage`; renders trusted-board outbound searches. |
| `lib/documentExport.ts` | `resumeHeader`, `resumeFitsOnePage`, `exportDocx`, `exportPdf` and `ContactLinks`/`ExportDocumentKind`; turns clean resume/email text into client downloads. |
| `lib/gmailCompose.ts` | `buildGmailComposeUrl`, `gmailComposeGuidance`; fills Gmail web compose URL but never sends. |
| `lib/trackerExport.ts` | Tracker workbook construction/download via `xlsx`. |
| `lib/jobDiscovery.ts` | Board metadata and `buildJobBoardSearchUrl` role/location/recency query construction. |
| `lib/reminders.ts` | Follow-up grouping/date display helpers used by dashboard. |
| `lib/intakeFallback.ts` | Public-link import fallback/visible error text helpers. |
| `lib/portableRuntime.ts` | Portable runtime feature checks used to hide disallowed source-PDF upload. |
| `contexts/ThemeContext.tsx` | Theme provider/toggle, persisted light/dark appearance. |
| `hooks/useComposition.ts`, `useMobile.tsx`, `usePersistFn.ts` | Generic React composition, media-query, and stable callback helpers. |
| `components/ui/*.tsx` | Presentational Radix/shadcn primitives catalogued in `ARCHITECTURE.md`; no app API/database/provider calls. |

## Call graph for core generation

```text
JobWorkspace/StartApplicationDialog
  → trpc.jobs.generateDrafts
  → personalUser + db.getMasterProfile + db.getJobForUser
  → generateOnePageResume ─┬→ build*ResumeMessages
                            └→ generateDraftText → generatePortableDraftText → Gemini OR Groq
  → generateOutreachEmail ─┬→ build*EmailMessages
                            └→ generateDraftText → provider
  → cleanEmailDraft → appendEmailSignature → db.updateJobForUser
  → React Query invalidation / preview requires user approval
```

## Exhaustive exported-symbol ledger

This appendix records the remaining exported surface not expanded in the product-flow tables above. Unless a function says otherwise, a client component is a React function returning `React.ReactElement`; its side effect is rendering/event handling only. Every `components/ui/*` export is a typed `forwardRef` React wrapper around a native element or its named Radix primitive; it receives the corresponding native/Radix props plus an optional `className`, returns an element, calls no network/database API, and is called by product components only when imported.

| File | Exact exports, signature/result, and dependency direction |
|---|---|
| `client/src/_core/hooks/useAuth.ts` | `useAuth(options?: UseAuthOptions)` returns legacy auth query/login/logout state; calls `trpc.auth.*`; used only by legacy/template layout paths. |
| `client/src/const.ts` | `startLogin(): void` changes `window.location.href` to legacy OAuth login; re-exports `COOKIE_NAME`, `ONE_YEAR_MS`; legacy only. |
| `client/src/contexts/ThemeContext.tsx` | `ThemeProvider({children,defaultTheme?})` returns provider; `useTheme(): ThemeContextValue` returns theme/setTheme; reads/writes browser preference. |
| `client/src/hooks/useComposition.ts` | `useComposition<T>(options: UseCompositionOptions<T>): UseCompositionReturn<T>` composes callbacks; exported interfaces describe generic arguments/result. |
| `client/src/hooks/useMobile.tsx` | `useIsMobile(): boolean` subscribes to mobile media query. |
| `client/src/hooks/usePersistFn.ts` | `usePersistFn<T extends noop>(fn:T): T` returns a stable wrapper that calls latest `fn`. |
| `client/src/lib/documentExport.ts` | `createExportFilename(fileStem:string, kind:ExportDocumentKind, extension:"docx"\|"pdf"): string`; `formatDraftBlocks(content:string): DraftBlock[]`; `resumeHeader(content:string, contactLinks?:ContactLinks): {name:string;contacts:DocumentContactLink[];body:string}`; `resumeFitsOnePage(content:string): boolean`; `createDocxBlob(input:ExportDocumentInput): Promise<Blob>`; `createPdfArrayBuffer(input:ExportDocumentInput): ArrayBuffer`; `exportDocx(input):Promise<void>`; `exportPdf(input):void`. Exports types `ExportDocumentKind`, `DraftBlock`, `ContactLinks`, `DocumentContactLink`; called by workspace exports. |
| `client/src/lib/emailDraft.ts` | `cleanEmailDraftForDisplay(value:string):string`; removes saved wrapper artifacts; workspace/compose display caller. |
| `client/src/lib/gmailCompose.ts` | `buildGmailComposeUrl({to?,subject,body}:GmailComposeInput):string`; `gmailComposeGuidance(to?:string\|null):string`; opens no request itself; `GmailComposeAction` caller. |
| `client/src/lib/intakeFallback.ts` | `applyManualPostingContext<T extends ManualContextForm>(form:T,pastedText:string):T`; `hasSufficientManualContext(pastedText:string):boolean`; used by job intake fallback. |
| `client/src/lib/jobDiscovery.ts` | Types `JobRecency`, `JobDiscoverySource`, `JobDiscoveryLink`; `jobDiscoverySources: readonly JobDiscoverySource[]`; `buildJobDiscoveryLinks(role:string,location="",recency:JobRecency="week"):JobDiscoveryLink[]`; page caller, creates only outbound URLs. |
| `client/src/lib/portableRuntime.ts` | `portableFileUploadEnabled(value=import.meta.env.VITE_PORTABLE_AUTH_ENABLED):boolean`; profile UI capability condition. |
| `client/src/lib/reminders.ts` | Types `ReminderJob`, `ReminderGroups<T>`; `groupFollowUpReminders<T extends ReminderJob>(jobs:T[],referenceDate=new Date()):ReminderGroups<T>`; dashboard caller. |
| `client/src/lib/trackerExport.ts` | Type `TrackerExportJob`; `trackerExportRows(jobs):Record<string,unknown>[]`; `trackerWorkbook(jobs):XLSX.WorkBook`; `downloadTrackerWorkbook(jobs):void`; dashboard caller/download side effect. |
| `client/src/lib/trpc.ts` | `trpc = createTRPCReact<AppRouter>()`; client procedure hook factory. |
| `client/src/lib/utils.ts` | `cn(...inputs:ClassValue[]):string`; combines `clsx` and `tailwind-merge`; UI callers. |
| `client/src/components/AIChatBox.tsx` | Types `Message`, `AIChatBoxProps`; `AIChatBox(props):ReactElement`; template streaming chat UI, no job-server use. |
| `client/src/components/DashboardLayoutSkeleton.tsx` | `DashboardLayoutSkeleton():ReactElement`; layout loading UI. |
| `client/src/components/GmailComposeAction.tsx` | `GmailComposeAction({composeUrl,recipient,onComposeOpen}:GmailComposeActionProps):ReactElement`; `window.open` manual composition side effect. |
| `client/src/components/GmailDraftAttachmentAction.tsx` | `GmailDraftAttachmentAction({jobId,eligible,saveRequired}):ReactElement`; owner browser posts portable Gmail draft endpoint; workspace caller. |
| `client/src/components/ManusDialog.tsx` | `ManusDialog(props):ReactElement`; wrapper around dialog primitives. |
| `client/src/components/Map.tsx` | `MapView(props):ReactElement`; template Maps rendering/callback UI. |
| `client/src/components/PortableOwnerAccess.tsx` | `usePortableStatus():PortableStatus`; REST status query; `PortableOwnerAccess({children}):ReactElement`; sign-in gating/redirect link. |
| `client/src/components/ui/accordion.tsx` | `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent`. |
| `client/src/components/ui/alert-dialog.tsx` | `AlertDialog`, `AlertDialogPortal`, `AlertDialogOverlay`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogFooter`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogAction`, `AlertDialogCancel`. |
| `client/src/components/ui/alert.tsx` | `Alert`, `AlertTitle`, `AlertDescription`. |
| `client/src/components/ui/aspect-ratio.tsx` | `AspectRatio`. |
| `client/src/components/ui/avatar.tsx` | `Avatar`, `AvatarImage`, `AvatarFallback`. |
| `client/src/components/ui/badge.tsx` | `Badge`, `badgeVariants`. |
| `client/src/components/ui/breadcrumb.tsx` | `Breadcrumb`, `BreadcrumbList`, `BreadcrumbItem`, `BreadcrumbLink`, `BreadcrumbPage`, `BreadcrumbSeparator`, `BreadcrumbEllipsis`. |
| `client/src/components/ui/button-group.tsx` | `ButtonGroup`, `ButtonGroupText`, `ButtonGroupSeparator`. |
| `client/src/components/ui/button.tsx` | `Button`, `buttonVariants`. |
| `client/src/components/ui/calendar.tsx` | `Calendar`, `CalendarDayButton`. |
| `client/src/components/ui/card.tsx` | `Card`, `CardHeader`, `CardFooter`, `CardTitle`, `CardAction`, `CardDescription`, `CardContent`. |
| `client/src/components/ui/carousel.tsx` | `Carousel`, `CarouselContent`, `CarouselItem`, `CarouselPrevious`, `CarouselNext`, `useCarousel`. |
| `client/src/components/ui/chart.tsx` | Type `ChartConfig`; `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`, `ChartLegendContent`, `ChartStyle`. |
| `client/src/components/ui/checkbox.tsx` | `Checkbox`. |
| `client/src/components/ui/collapsible.tsx` | `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`. |
| `client/src/components/ui/command.tsx` | `Command`, `CommandDialog`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandShortcut`, `CommandSeparator`. |
| `client/src/components/ui/context-menu.tsx` | `ContextMenu`, trigger/group/portal/sub/radio/content/item/checkbox/radio/label/separator/shortcut exports matching named Radix primitives. |
| `client/src/components/ui/dialog.tsx` | `useDialogComposition`, `Dialog`, `DialogClose`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogOverlay`, `DialogPortal`, `DialogTitle`, `DialogTrigger`. |
| `client/src/components/ui/drawer.tsx` | `Drawer`, `DrawerPortal`, `DrawerOverlay`, `DrawerTrigger`, `DrawerClose`, `DrawerContent`, `DrawerHeader`, `DrawerFooter`, `DrawerTitle`, `DrawerDescription`. |
| `client/src/components/ui/dropdown-menu.tsx` | `DropdownMenu`, trigger/group/portal/sub/radio/content/item/checkbox/radio/label/separator/shortcut exports matching named Radix primitives. |
| `client/src/components/ui/empty.tsx` | `Empty`, `EmptyHeader`, `EmptyMedia`, `EmptyTitle`, `EmptyDescription`, `EmptyContent`. |
| `client/src/components/ui/field.tsx` | `Field`, `FieldLabel`, `FieldDescription`, `FieldError`, `FieldGroup`, `FieldSet`, `FieldLegend`, `FieldContent`, `FieldTitle`, `FieldSeparator`. |
| `client/src/components/ui/form.tsx` | `Form`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`, `useFormField`. |
| `client/src/components/ui/hover-card.tsx` | `HoverCard`, `HoverCardTrigger`, `HoverCardContent`. |
| `client/src/components/ui/input-group.tsx` | `InputGroup`, `InputGroupAddon`, `InputGroupButton`, `InputGroupText`, `InputGroupInput`, `InputGroupTextarea`. |
| `client/src/components/ui/input-otp.tsx` | `InputOTP`, `InputOTPGroup`, `InputOTPSlot`, `InputOTPSeparator`. |
| `client/src/components/ui/input.tsx` | `Input`. |
| `client/src/components/ui/item.tsx` | `Item`, `ItemGroup`, `ItemSeparator`, `ItemMedia`, `ItemContent`, `ItemTitle`, `ItemDescription`, `ItemActions`, `ItemHeader`, `ItemFooter`. |
| `client/src/components/ui/kbd.tsx` | `Kbd`, `KbdGroup`. |
| `client/src/components/ui/label.tsx` | `Label`. |
| `client/src/components/ui/menubar.tsx` | Full named `Menubar*` Radix wrapper export set: menu, trigger, group, portal, sub, radio, content, item, checkbox, radio item, label, separator, shortcut. |
| `client/src/components/ui/navigation-menu.tsx` | `NavigationMenu`, `NavigationMenuList`, `NavigationMenuItem`, `NavigationMenuContent`, `NavigationMenuTrigger`, `NavigationMenuLink`, `NavigationMenuIndicator`, `navigationMenuTriggerStyle`, `NavigationMenuViewport`. |
| `client/src/components/ui/pagination.tsx` | `Pagination`, `PaginationContent`, `PaginationEllipsis`, `PaginationItem`, `PaginationLink`, `PaginationNext`, `PaginationPrevious`. |
| `client/src/components/ui/popover.tsx` | `Popover`, `PopoverTrigger`, `PopoverContent`, `PopoverAnchor`. |
| `client/src/components/ui/progress.tsx` | `Progress`. |
| `client/src/components/ui/radio-group.tsx` | `RadioGroup`, `RadioGroupItem`. |
| `client/src/components/ui/resizable.tsx` | `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle`. |
| `client/src/components/ui/scroll-area.tsx` | `ScrollArea`, `ScrollBar`. |
| `client/src/components/ui/select.tsx` | `Select`, `SelectGroup`, `SelectValue`, `SelectTrigger`, `SelectContent`, `SelectLabel`, `SelectItem`, `SelectSeparator`, `SelectScrollUpButton`, `SelectScrollDownButton`. |
| `client/src/components/ui/separator.tsx` | `Separator`. |
| `client/src/components/ui/sheet.tsx` | `Sheet`, `SheetPortal`, `SheetOverlay`, `SheetTrigger`, `SheetClose`, `SheetContent`, `SheetHeader`, `SheetFooter`, `SheetTitle`, `SheetDescription`. |
| `client/src/components/ui/sidebar.tsx` | Complete `Sidebar*` provider/layout/menu/group/input/rail/trigger/header/footer/content/section/action/badge/skeleton/sub/menu-button exports; visual/sidebar state only. |
| `client/src/components/ui/skeleton.tsx` | `Skeleton`. |
| `client/src/components/ui/slider.tsx` | `Slider`. |
| `client/src/components/ui/sonner.tsx` | `Toaster`. |
| `client/src/components/ui/spinner.tsx` | `Spinner`. |
| `client/src/components/ui/switch.tsx` | `Switch`. |
| `client/src/components/ui/table.tsx` | `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableHead`, `TableRow`, `TableCell`, `TableCaption`. |
| `client/src/components/ui/tabs.tsx` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`. |
| `client/src/components/ui/textarea.tsx` | `Textarea`. |
| `client/src/components/ui/toggle-group.tsx` | `ToggleGroup`, `ToggleGroupItem`. |
| `client/src/components/ui/toggle.tsx` | `Toggle`, `toggleVariants`. |
| `client/src/components/ui/tooltip.tsx` | `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider`. |
| `server/_core/context.ts` | Type `TrpcContext`; `createContext({req,res}):Promise<TrpcContext>` reads legacy/portable session context for procedures. |
| `server/_core/cookies.ts` | `getSessionCookieOptions(req):CookieOptions`; returns secure session cookie options for legacy auth. |
| `server/_core/dataApi.ts` | Type `DataApiCallOptions`; `callDataApi(options):Promise<unknown>` invokes legacy Forge Data API using `ENV` secret. |
| `server/_core/heartbeat.ts` | Types `HeartbeatJob`, `HeartbeatJobUpdate`, `HeartbeatJobInfo`; `createHeartbeatJob`, `updateHeartbeatJob`, `deleteHeartbeatJob`, `listHeartbeatJobs` call legacy scheduled-task endpoints; no core job flow calls them. |
| `server/_core/imageGeneration.ts` | Types `GenerateImageOptions`, `GenerateImageResponse`, `ImageModelInfo`, `ListImageModelsResponse`; `generateImage(options)` and `listImageModels()` call legacy Forge image APIs. |
| `server/_core/llm.ts` | Types `Role`, `TextContent`, `ImageContent`, `FileContent`, `MessageContent`, `Message`, tool/JSON/model types; `invokeLLM(params):Promise<InvokeResult>` and `listLLMModels():Promise<ModelsResponse>` call legacy Forge LLM; portable router avoids model list. |
| `server/_core/map.ts` | Request type enums/result DTOs and `makeRequest<T>(path,options):Promise<T>` proxy legacy Maps requests. |
| `server/_core/notification.ts` | `NotificationPayload`; `notifyOwner(payload):Promise<void>` calls legacy owner notification service. |
| `server/_core/oauth.ts` | `registerOAuthRoutes(app:Express):void`; legacy OAuth callbacks only outside portable mode. |
| `server/_core/sdk.ts` | Types `SessionPayload`, `AuthenticatedUser`; `sdk:SDKServer`; legacy authorization/token/user client. |
| `server/_core/static.ts` | `serveStatic(app:Express):void`; serves production `dist/public`. |
| `server/_core/storageProxy.ts` | `registerStorageProxy(app:Express):void`; registers legacy binary storage proxy. |
| `server/_core/systemRouter.ts` | `systemRouter`; legacy/system tRPC router. |
| `server/_core/trpc.ts` | `router`, `publicProcedure`, `protectedProcedure`, `adminProcedure`; wraps `requireUser` and role enforcement. |
| `server/_core/vite.ts` | `setupVite(app:Express,server:Server):Promise<void>`; development HMR/static middleware. |
| `server/_core/voiceTranscription.ts` | Types `TranscribeOptions`, `WhisperSegment`, `WhisperResponse`, `TranscriptionResponse`, `TranscriptionError`; `transcribeAudio(options):Promise<TranscriptionResponse>` invokes legacy transcription endpoint. |
| `server/storage.ts` | `storagePut(relKey,data,contentType?):Promise<{key,url}>`, `storageGet(relKey):Promise<{key,url}>`, `storageGetSignedUrl(relKey):Promise<string>`; Forge/S3 adapter, portable raw resume flow deliberately blocks before call. |
| `server/vercel/handler.ts` | `initializeApiApp():Promise<Express>` lazy singleton creator; module default handler awaits it and handles request/exception. |
| `shared/_core/errors.ts` | `HttpError(statusCode:number,message:string)` plus `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`; simple typed error constructors. |
| `shared/const.ts` | `COOKIE_NAME`, `ONE_YEAR_MS`, `AXIOS_TIMEOUT_MS`, auth messages, `OAUTH_STATE_COOKIE`; `encodeOAuthState(state):string`, `decodeOAuthState(state):OAuthState`; legacy auth-state codec. |
| `shared/types.ts` | `export type * from "../drizzle/schema"`; type-only re-export. |

### Private helper completeness note

Private (non-exported) helpers are intentionally module-local. They are all named in their owning module’s functional description: `sourceParts`/`groundingRules` in prompts; parsing/normalization helpers in document/attachment/MIME code; `contentToText` in each provider; cookie/state/owner helpers in portable routes; and `contentFrom`, `preferredModel`, `generateDraftText`, `generateOnePageResume`, `generateOutreachEmail`, `personalUser`, and `contactLinksFromStored` in `routers.ts`. Their side effects and direct callers are stated in the primary tables, so rebuilding requires no hidden cross-module API.
