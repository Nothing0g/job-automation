import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const dbMocks = vi.hoisted(() => ({
  getPersonalUser: vi.fn(),
  getMasterProfile: vi.fn(),
  saveMasterProfile: vi.fn(),
  listJobs: vi.fn(),
  getJobForUser: vi.fn(),
  createJob: vi.fn(),
  updateJobForUser: vi.fn(),
}));
const llmMocks = vi.hoisted(() => ({ invokeLLM: vi.fn(), listLLMModels: vi.fn() }));
const geminiMocks = vi.hoisted(() => ({ generateGeminiText: vi.fn() }));

vi.mock("./db", () => dbMocks);
vi.mock("./_core/llm", () => llmMocks);
vi.mock("./portable/gemini", () => ({
  GeminiProviderError: class GeminiProviderError extends Error {},
  generateGeminiText: geminiMocks.generateGeminiText,
}));

import { appRouter } from "./routers";
import { resumeDraftQualityIssue } from "./lib/draftQuality";
import { resumeFitsOnePage } from "./lib/onePageResume";

const personalUser = {
  id: 42,
  openId: "personal-workspace-owner",
  name: "Personal workspace",
  email: null,
  loginMethod: "direct-access",
  role: "admin" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function caller() {
  return appRouter.createCaller({
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  });
}

function portableCaller() {
  return appRouter.createCaller({
    user: { ...personalUser, email: "owner@example.com" },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  });
}

describe("personal workspace routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    dbMocks.getPersonalUser.mockResolvedValue(personalUser);
  });

  it("returns null—not undefined—when the personal workspace has no saved profile", async () => {
    dbMocks.getMasterProfile.mockResolvedValue(null);
    await expect(caller().profile.get()).resolves.toBeNull();
    expect(dbMocks.getMasterProfile).toHaveBeenCalledWith(personalUser.id);
  });

  it("creates a direct-access application with its tracker fields", async () => {
    const created = { id: 9, company: "Northstar", role: "Analyst" };
    dbMocks.createJob.mockResolvedValue(created);
    const result = await caller().jobs.create({
      company: "Northstar",
      role: "Analyst",
      jobDescription: "Use analysis, reporting, and SQL to help the operations team make better decisions every week.",
      contextMode: "full",
      contactEmail: "hiring@northstar.example",
      status: "to-apply",
      nextAction: "Send a concise note to the hiring team",
      followUpAt: "2026-09-01",
    });
    expect(result).toEqual(created);
    expect(dbMocks.createJob).toHaveBeenCalledWith(personalUser.id, expect.objectContaining({
      contactEmail: "hiring@northstar.example",
      nextAction: "Send a concise note to the hiring team",
      followUpAt: new Date("2026-09-01T12:00:00.000Z"),
    }));
  });

  it("requires a recipient email for a Full Details application", async () => {
    await expect(caller().jobs.create({
      company: "Northstar",
      role: "Analyst",
      jobDescription: "Use analysis, reporting, and SQL to help the operations team make better decisions every week.",
      contextMode: "full",
      status: "to-apply",
    })).rejects.toThrow("Enter the company or hiring email");
    expect(dbMocks.createJob).not.toHaveBeenCalled();
  });

  it("creates a limited-context application with only role, company, and contact email", async () => {
    dbMocks.createJob.mockResolvedValue({ id: 10, company: "Brivo", role: "AI Product Intern" });
    await caller().jobs.create({
      company: "Brivo",
      role: "AI Product Intern",
      jobDescription: "",
      contextMode: "limited",
      contactEmail: "hiring@brivo.com",
      status: "to-apply",
    });
    expect(dbMocks.createJob).toHaveBeenCalledWith(personalUser.id, expect.objectContaining({
      contextMode: "limited",
      contactEmail: "hiring@brivo.com",
      jobDescription: "",
    }));
  });

  it("clears tracker fields explicitly when updating an application", async () => {
    dbMocks.updateJobForUser.mockResolvedValue({ id: 9 });
    await caller().jobs.update({ id: 9, nextAction: null, followUpAt: null });
    expect(dbMocks.updateJobForUser).toHaveBeenCalledWith(personalUser.id, 9, { nextAction: null, followUpAt: null });
  });

  it("persists a recipient email updated from a Full Details workspace", async () => {
    dbMocks.updateJobForUser.mockResolvedValue({ id: 9, contactEmail: "talent@northstar.example" });

    await caller().jobs.update({ id: 9, contactEmail: "talent@northstar.example" });

    expect(dbMocks.updateJobForUser).toHaveBeenCalledWith(personalUser.id, 9, {
      contactEmail: "talent@northstar.example",
    });
  });

  it("persists approval only after a tailored resume exists", async () => {
    dbMocks.getJobForUser.mockResolvedValue({ id: 9, tailoredResume: "# Candidate\n## EXPERIENCE\n- Supported achievement" });
    dbMocks.updateJobForUser.mockResolvedValue({ id: 9, tailoredResumeApprovedAt: new Date("2026-08-17T00:00:00.000Z") });

    await caller().jobs.setResumeApproval({ id: 9, approved: true });

    expect(dbMocks.updateJobForUser).toHaveBeenCalledWith(personalUser.id, 9, { tailoredResumeApprovedAt: expect.any(Date) });
  });

  it("does not approve an empty tailored resume", async () => {
    dbMocks.getJobForUser.mockResolvedValue({ id: 9, tailoredResume: null });
    await expect(caller().jobs.setResumeApproval({ id: 9, approved: true })).rejects.toThrow("Generate or save a tailored resume");
    expect(dbMocks.updateJobForUser).not.toHaveBeenCalled();
  });

  it("requires a generated one-page role-based resume before a No JD application can be approved", async () => {
    dbMocks.getJobForUser.mockResolvedValueOnce({ id: 10, contextMode: "limited", tailoredResume: null });

    await expect(caller().jobs.setResumeApproval({ id: 10, approved: true })).rejects.toThrow("Generate or save a tailored resume");
    expect(dbMocks.updateJobForUser).not.toHaveBeenCalled();

    dbMocks.getJobForUser.mockResolvedValueOnce({
      id: 10,
      contextMode: "limited",
      tailoredResume: "# Candidate Name\ncontact@example.com\n## EXPERIENCE\n### Product Intern\n- Built a documented research workflow.",
    });
    dbMocks.updateJobForUser.mockResolvedValue({ id: 10, tailoredResumeApprovedAt: new Date("2026-08-17T00:00:00.000Z") });

    await caller().jobs.setResumeApproval({ id: 10, approved: true });

    expect(dbMocks.updateJobForUser).toHaveBeenLastCalledWith(personalUser.id, 10, { tailoredResumeApprovedAt: expect.any(Date) });
  });

  it("shortens an overlong generated resume before it is persisted", async () => {
    const overlong = `# Candidate Name\ncontact@example.com\n## EXPERIENCE\n${Array.from({ length: 150 }, (_, index) => `- Factual accomplishment ${index + 1} with a documented outcome and relevant implementation detail.`).join("\n")}`;
    const compact = "# Candidate Name\ncontact@example.com\n## EXPERIENCE\n### Analyst\n- Built a factual reporting workflow.";
    dbMocks.getMasterProfile.mockResolvedValue({ resumeText: "Analyst with reporting experience.", personalBio: null, emailSignature: null, resumeFileKey: null });
    dbMocks.getJobForUser.mockResolvedValue({ id: 9, company: "Northstar", role: "Analyst", jobDescription: "Use reporting to support decisions.", contextMode: "full" });
    llmMocks.listLLMModels.mockResolvedValue({ data: [{ id: "claude-sonnet-test" }] });
    llmMocks.invokeLLM
      .mockResolvedValueOnce({ choices: [{ message: { content: overlong } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: "Hello Hiring Team," } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: compact } }] });
    dbMocks.updateJobForUser.mockResolvedValue({ id: 9, tailoredResume: compact });

    await caller().jobs.generateDrafts({ id: 9 });

    expect(dbMocks.updateJobForUser).toHaveBeenLastCalledWith(personalUser.id, 9, expect.objectContaining({ tailoredResume: compact, tailoredResumeApprovedAt: null }));
  });

  it("generates a one-page role-based resume and factual outreach for a No JD application", async () => {
    const roleBasedResume = "# Candidate Name\ncontact@example.com\n## EXPERIENCE\n### Product intern\n- Built a documented research workflow.";
    dbMocks.getMasterProfile.mockResolvedValue({ resumeText: "Built a documented research workflow.", personalBio: null, emailSignature: "Best,\nCandidate", resumeFileKey: null });
    dbMocks.getJobForUser.mockResolvedValue({ id: 10, company: "Brivo", role: "AI Product Intern", jobDescription: "", contextMode: "limited" });
    llmMocks.listLLMModels.mockResolvedValue({ data: [{ id: "claude-sonnet-test" }] });
    llmMocks.invokeLLM
      .mockResolvedValueOnce({ choices: [{ message: { content: roleBasedResume } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: "Hello,\n\nCould you share the job description?" } }] });
    dbMocks.updateJobForUser.mockResolvedValue({ id: 10, tailoredResume: roleBasedResume });

    await caller().jobs.generateDrafts({ id: 10 });

    expect(String(llmMocks.invokeLLM.mock.calls[0][0].messages[0].content)).toContain("ROLE-BASED resume—not a JD-tailored resume");
    expect(dbMocks.updateJobForUser).toHaveBeenLastCalledWith(personalUser.id, 10, expect.objectContaining({
      tailoredResume: roleBasedResume,
      tailoredResumeApprovedAt: null,
      emailDraft: expect.stringContaining("Could you share the job description?"),
    }));
  });

  it("uses Gemini directly in portable No JD mode without querying the legacy model catalogue", async () => {
    const roleBasedResume = "# Candidate Name\ncontact@example.com\n## EXPERIENCE\n### Product intern\n- Built a documented research workflow.";
    vi.stubEnv("PORTABLE_AUTH_ENABLED", "true");
    vi.stubEnv("GEMINI_API_KEY", "test-server-only-key");
    dbMocks.getMasterProfile.mockResolvedValue({ resumeText: "Built a documented research workflow.", personalBio: null, emailSignature: null, resumeFileKey: null });
    dbMocks.getJobForUser.mockResolvedValue({ id: 10, company: "Brivo", role: "AI Product Intern", jobDescription: "", contextMode: "limited" });
    geminiMocks.generateGeminiText
      .mockResolvedValueOnce(roleBasedResume)
      .mockResolvedValueOnce("Hello Hiring Team,");
    dbMocks.updateJobForUser.mockResolvedValue({ id: 10, tailoredResume: roleBasedResume });

    await portableCaller().jobs.generateDrafts({ id: 10 });

    expect(llmMocks.listLLMModels).not.toHaveBeenCalled();
    expect(llmMocks.invokeLLM).not.toHaveBeenCalled();
    expect(geminiMocks.generateGeminiText).toHaveBeenCalledTimes(2);
    expect(dbMocks.updateJobForUser).toHaveBeenLastCalledWith(personalUser.id, 10, expect.objectContaining({
      tailoredResume: roleBasedResume,
      tailoredResumeApprovedAt: null,
      emailDraft: "Hello Hiring Team,",
    }));
  });

  it("regenerates incomplete portable Gemini drafts before persisting a substantive saved profile", async () => {
    const sourceResume = `SHUBHAM KUMAR
PROFESSIONAL SUMMARY
Product-minded engineering student with structured analysis and data work experience.
EDUCATION
B.Tech Mechanical Engineering at Delhi Technological University.
PROFESSIONAL EXPERIENCE
Product Research Intern at Northstar Labs. Interviewed users, mapped workflows, and documented product requirements.
PROJECTS
CultFit Fitness App Analytics: surveyed 20 users and analyzed feedback to prioritize onboarding improvements.
SKILLS
SQL, Python, user research, product analytics, and stakeholder communication.`;
    const incompleteResume = `# SHUBHAM KUMAR
Email
## PROFESSIONAL SUMMARY
Product-minded engineering student with structured analysis experience.
## EDUCATION
B.Tech Mechanical Engineering, Delhi Technological University.`;
    const completeResume = `# SHUBHAM KUMAR
Email · LinkedIn · GitHub
## PROFESSIONAL SUMMARY
Product-minded engineering student with structured analysis, user research, and data work experience.
## EDUCATION
B.Tech Mechanical Engineering, Delhi Technological University, with structured problem-solving practice.
## PROFESSIONAL EXPERIENCE
### Product Research Intern — Northstar Labs
- Interviewed users and mapped workflows to document clear product requirements.
- Organized research observations into concise records for product discussions.
## PROJECTS
### CultFit Fitness App Analytics
- Surveyed 20 users and analyzed feedback to prioritize onboarding improvements.
- Converted user evidence into structured experience-backed product ideas.
## SKILLS
SQL, Python, user research, product analytics, stakeholder communication, workflow mapping, and structured analysis.`;
    const weakEmail = "Hello, I saw the Product Intern role at BLive. I am interested. Best, Shubham";
    const completeEmail = `Hello,

I came across the Product Intern opportunity at BLive and wanted to introduce myself. During my Product Research Intern work at Northstar Labs, I interviewed users, mapped workflows, and turned those observations into documented product requirements. I also built a CultFit Fitness App Analytics project where I surveyed 20 users and analyzed their feedback to prioritize onboarding improvements.

Those experiences taught me to connect qualitative user evidence with structured analysis, while keeping the next product decision clear for stakeholders. I would appreciate the chance to learn whether the role is still open and, if so, review the detailed job description or application guidance.

Best,
Shubham Kumar`;
    vi.stubEnv("PORTABLE_AUTH_ENABLED", "true");
    vi.stubEnv("GEMINI_API_KEY", "test-server-only-key");
    dbMocks.getMasterProfile.mockResolvedValue({ resumeText: sourceResume, personalBio: null, emailSignature: null, resumeFileKey: null });
    dbMocks.getJobForUser.mockResolvedValue({ id: 10, company: "BLive", role: "Product Intern", jobDescription: "", contextMode: "limited" });
    let resumeCalls = 0;
    let emailCalls = 0;
    geminiMocks.generateGeminiText.mockImplementation(async ({ maxOutputTokens }: { maxOutputTokens: number }) => {
      if (maxOutputTokens === 2600) {
        resumeCalls += 1;
        return resumeCalls === 1 ? incompleteResume : completeResume;
      }
      emailCalls += 1;
      return emailCalls === 1 ? weakEmail : completeEmail;
    });
    dbMocks.updateJobForUser.mockResolvedValue({ id: 10, tailoredResume: completeResume, emailDraft: completeEmail });

    expect(resumeFitsOnePage(completeResume)).toBe(true);
    expect(resumeDraftQualityIssue(completeResume, sourceResume)).toBeNull();
    await portableCaller().jobs.generateDrafts({ id: 10 });

    expect(geminiMocks.generateGeminiText).toHaveBeenCalledTimes(4);
    expect(dbMocks.updateJobForUser).toHaveBeenLastCalledWith(personalUser.id, 10, expect.objectContaining({
      tailoredResume: completeResume,
      tailoredResumeApprovedAt: null,
      emailDraft: completeEmail,
    }));
  });
});
