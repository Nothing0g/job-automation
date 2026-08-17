import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { applicationStatuses, jobContextModes } from "../drizzle/schema";
import * as db from "./db";
import { buildEmailMessages, buildLimitedContextEmailMessages, buildResumeMessages, buildResumeShorteningMessages } from "./lib/aiPrompts";
import { fetchPublicJobPosting } from "./lib/jobPosting";
import { parseFollowUpDate } from "./lib/jobTracker";
import { appendEmailSignature } from "./lib/emailSignature";
import { cleanEmailDraft } from "./lib/emailDraft";
import { resumeFitsOnePage } from "./lib/onePageResume";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM, listLLMModels } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { storageGetSignedUrl, storagePut } from "./storage";

const statusSchema = z.enum(applicationStatuses);
const dateInputSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalUrl = z.union([z.string().trim().url().max(1_000), z.literal("")]);
const contactLinksSchema = z.object({
  email: z.union([z.string().trim().email().max(320), z.literal("")]),
  phone: z.string().trim().max(80),
  linkedin: optionalUrl,
  github: optionalUrl,
  portfolio: optionalUrl,
}).default({ email: "", phone: "", linkedin: "", github: "", portfolio: "" });
type ContactLinks = z.infer<typeof contactLinksSchema>;

function contactLinksFromStored(value: string | null): ContactLinks {
  if (!value) return { email: "", phone: "", linkedin: "", github: "", portfolio: "" };
  try { return contactLinksSchema.parse(JSON.parse(value)); } catch { return { email: "", phone: "", linkedin: "", github: "", portfolio: "" }; }
}
const jobFields = {
  company: z.string().trim().min(1).max(255),
  role: z.string().trim().min(1).max(255),
  jobDescription: z.string().trim().max(100_000),
  contextMode: z.enum(jobContextModes),
  contactEmail: z.string().trim().email().max(320).nullable().optional(),
  sourceUrl: z.string().url().max(2_000).nullable().optional(),
  status: statusSchema,
  nextAction: z.string().trim().max(500).nullable().optional(),
  followUpAt: dateInputSchema.nullable().optional(),
};

const createJobSchema = z.object(jobFields).superRefine((input, context) => {
  if (input.contextMode === "full" && input.jobDescription.length < 40) {
    context.addIssue({ code: "custom", path: ["jobDescription"], message: "Paste at least 40 characters of the job description, or use No JD Mode." });
  }
  if (!input.contactEmail) {
    context.addIssue({ code: "custom", path: ["contactEmail"], message: "Enter the company or hiring email so Gmail can prefill the recipient." });
  }
});

async function personalUser() {
  try {
    return await db.getPersonalUser();
  } catch {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Your personal workspace could not be initialized." });
  }
}

function contentFrom(result: Awaited<ReturnType<typeof invokeLLM>>) {
  const content = result.choices[0]?.message.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The drafting service returned an empty response. Please try again." });
  }
  return content.trim();
}

async function preferredModel() {
  const catalog = await listLLMModels();
  return catalog.data.find(model => model.id.startsWith("claude-sonnet"))?.id ?? catalog.data.find(model => model.id === "gpt-5")?.id ?? catalog.data.find(model => model.id.startsWith("gpt-5"))?.id;
}

async function generateOnePageResume(model: string | undefined, profile: { resumeText: string | null; personalBio: string | null; resumeFileUrl?: string }, job: { company: string; role: string; jobDescription: string; contextMode: "full" | "limited" }) {
  let draft = contentFrom(await invokeLLM({ model, messages: buildResumeMessages(profile, job), maxTokens: 2600 }));
  for (let attempt = 0; attempt < 2 && !resumeFitsOnePage(draft); attempt += 1) {
    draft = contentFrom(await invokeLLM({ model, messages: buildResumeShorteningMessages(profile, job, draft), maxTokens: 1800 }));
  }
  if (!resumeFitsOnePage(draft)) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The resume draft could not be condensed to the fixed one-page format. Please try generating it again." });
  }
  return draft;
}

export const appRouter = router({
  system: systemRouter,
  // Kept for framework compatibility; the product itself does not show a sign-in flow.
  auth: router({
    me: publicProcedure.query(async () => null),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  profile: router({
    get: publicProcedure.query(async () => {
      const user = await personalUser();
      const profile = await db.getMasterProfile(user.id);
      return profile ? { ...profile, contactLinks: contactLinksFromStored(profile.contactLinks) } : null;
    }),
    save: publicProcedure
      .input(z.object({ resumeText: z.string().max(100_000).optional(), personalBio: z.string().max(20_000).optional(), emailSignature: z.string().max(6_000).optional(), contactLinks: contactLinksSchema.optional() }))
      .mutation(async ({ input }) => {
        const user = await personalUser();
        const { contactLinks, ...profileInput } = input;
        const profile = await db.saveMasterProfile(user.id, { ...profileInput, ...(contactLinks ? { contactLinks: JSON.stringify(contactLinks) } : {}) });
        return profile ? { ...profile, contactLinks: contactLinksFromStored(profile.contactLinks) } : null;
      }),
    uploadPdf: publicProcedure
      .input(z.object({ filename: z.string().min(1).max(255), mimeType: z.string(), base64: z.string().min(16).max(12_000_000) }))
      .mutation(async ({ input }) => {
        const user = await personalUser();
        if (input.mimeType !== "application/pdf" && !input.filename.toLowerCase().endsWith(".pdf")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Upload a PDF resume or paste the resume as text." });
        }
        const bytes = Buffer.from(input.base64, "base64");
        if (bytes.byteLength > 8 * 1024 * 1024 || bytes.subarray(0, 4).toString() !== "%PDF") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "The resume must be a valid PDF smaller than 8 MB." });
        }
        const safeFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, "-");
        const stored = await storagePut(`personal-workspace/master-resume/${safeFilename}`, bytes, "application/pdf");
        return db.saveMasterProfile(user.id, { resumeFileKey: stored.key });
      }),
  }),
  jobs: router({
    list: publicProcedure.query(async () => db.listJobs((await personalUser()).id)),
    get: publicProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => db.getJobForUser((await personalUser()).id, input.id)),
    create: publicProcedure.input(createJobSchema).mutation(async ({ input }) => {
      const user = await personalUser();
      return db.createJob(user.id, {
        ...input,
        jobDescription: input.jobDescription || "",
        contactEmail: input.contactEmail || null,
        sourceUrl: input.sourceUrl || null,
        nextAction: input.nextAction || null,
        followUpAt: parseFollowUpDate(input.followUpAt),
      });
    }),
    importPublicLink: publicProcedure
      .input(z.object({ url: z.string().trim().url().max(2_000) }))
      .mutation(async ({ input }) => {
        try {
          return await fetchPublicJobPosting(input.url);
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "This public job link could not be imported." });
        }
      }),
    update: publicProcedure
      .input(z.object({
        id: z.number().int().positive(),
        company: jobFields.company.optional(),
        role: jobFields.role.optional(),
        jobDescription: jobFields.jobDescription.optional(),
        contextMode: jobFields.contextMode.optional(),
        contactEmail: jobFields.contactEmail,
        sourceUrl: jobFields.sourceUrl,
        status: statusSchema.optional(),
        tailoredResume: z.string().max(100_000).optional(),
        emailDraft: z.string().max(40_000).optional(),
        notes: z.string().max(40_000).optional(),
        nextAction: jobFields.nextAction,
        followUpAt: jobFields.followUpAt,
      }))
      .mutation(async ({ input }) => {
        const user = await personalUser();
        const { id, followUpAt, nextAction, ...data } = input;
        const resumeChanged = data.tailoredResume !== undefined;
        const targetChanged = ["company", "role", "jobDescription", "contextMode"].some(field => data[field as keyof typeof data] !== undefined);
        const updated = await db.updateJobForUser(user.id, id, {
          ...data,
          ...((resumeChanged || targetChanged) ? { tailoredResumeApprovedAt: null } : {}),
          ...(nextAction === undefined ? {} : { nextAction: nextAction || null }),
          ...(followUpAt === undefined ? {} : { followUpAt: parseFollowUpDate(followUpAt) }),
        });
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "This job no longer exists." });
        return updated;
      }),
    setResumeApproval: publicProcedure
      .input(z.object({ id: z.number().int().positive(), approved: z.boolean() }))
      .mutation(async ({ input }) => {
        const user = await personalUser();
        const job = await db.getJobForUser(user.id, input.id);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "This job no longer exists." });
        if (input.approved && !job.tailoredResume?.trim()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Generate or save a tailored resume before approving it." });
        }
        if (input.approved && !resumeFitsOnePage(job.tailoredResume ?? "")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This resume is longer than the fixed one-page layout. Shorten it before approval." });
        }
        return db.updateJobForUser(user.id, job.id, { tailoredResumeApprovedAt: input.approved ? new Date() : null });
      }),
    generateDrafts: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const user = await personalUser();
        const [profile, job] = await Promise.all([db.getMasterProfile(user.id), db.getJobForUser(user.id, input.id)]);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "This job no longer exists." });
        if (!profile || (!profile.resumeText?.trim() && !profile.resumeFileKey)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Save a master resume before generating a tailored resume or outreach email." });
        }
        const resumeFileUrl = profile.resumeFileKey ? await storageGetSignedUrl(profile.resumeFileKey) : undefined;
        const profileContext = { resumeText: profile.resumeText, personalBio: profile.personalBio, resumeFileUrl };
        const model = await preferredModel();
        if (job.contextMode === "limited") {
          const emailResult = await invokeLLM({ model, messages: buildLimitedContextEmailMessages(profileContext, job), maxTokens: 1400 });
          return db.updateJobForUser(user.id, job.id, { emailDraft: appendEmailSignature(cleanEmailDraft(contentFrom(emailResult)), profile.emailSignature) });
        }
        const [tailoredResume, emailResult] = await Promise.all([
          generateOnePageResume(model, profileContext, job),
          invokeLLM({ model, messages: buildEmailMessages(profileContext, job), maxTokens: 1600 }),
        ]);
        return db.updateJobForUser(user.id, job.id, { tailoredResume, tailoredResumeApprovedAt: null, emailDraft: appendEmailSignature(cleanEmailDraft(contentFrom(emailResult)), profile.emailSignature) });
      }),
  }),
});

export type AppRouter = typeof appRouter;
