import { describe, expect, it } from "vitest";
import { buildEmailMessages, buildLimitedContextEmailMessages, buildResumeMessages, buildRoleBasedResumeMessages } from "./aiPrompts";

const profile = {
  resumeText: "Analyst at Northstar. Built weekly reporting in SQL.",
  personalBio: "I value direct, thoughtful communication.",
};
const job = { company: "Orbit", role: "Data Analyst", jobDescription: "Use SQL to improve reporting.", contextMode: "full" as const };

describe("grounded AI prompts", () => {
  it("places the complete candidate source and job description in the resume request", () => {
    const messages = buildResumeMessages(profile, job);
    expect(String(messages[0].content)).toContain("Do not invent");
    expect(String(messages[0].content)).toContain("one-page resume");
    expect(String(messages[0].content)).toContain("620 words");
    expect(String(messages[0].content)).toContain("job's stated duties, tools, domain terms, and outcomes");
    expect(String(messages[0].content)).toContain("Every retained bullet must either directly support a target priority");
    expect(String(messages[0].content)).toContain("silently make a relevance map");
    expect(String(messages[0].content)).toContain("kept, moved earlier, rephrased, compressed, or omitted");
    expect(String(messages[0].content)).toContain("omit lower-relevance material");
    expect(JSON.stringify(messages[1].content)).toContain(profile.resumeText);
    expect(JSON.stringify(messages[1].content)).toContain(job.jobDescription);
  });

  it("prohibits ungrounded company research in outreach drafts", () => {
    const messages = buildEmailMessages(profile, job);
    expect(String(messages[0].content)).toContain("Do not use external research");
    expect(String(messages[0].content)).toContain("only the email body");
    expect(String(messages[0].content)).toContain("came across the");
    expect(String(messages[0].content)).toContain("perfect fit");
    expect(String(messages[0].content)).toContain("Build confidence through evidence");
    expect(String(messages[0].content)).toContain("email body\” label");
  });

  it("uses a factual email-only approach when no job description is available", () => {
    const messages = buildLimitedContextEmailMessages(profile, { ...job, jobDescription: "", contextMode: "limited" });
    expect(String(messages[0].content)).toContain("has not provided a job description");
    expect(String(messages[0].content)).toContain("request the detailed job description");
    expect(String(messages[0].content)).toContain("tailored resume claim");
  });

  it("builds a role-based—not JD-tailored—resume request when no job description is available", () => {
    const messages = buildRoleBasedResumeMessages(profile, { ...job, jobDescription: "", contextMode: "limited" });
    expect(String(messages[0].content)).toContain("ROLE-BASED resume—not a JD-tailored resume");
    expect(String(messages[0].content)).toContain("Do not infer the employer's duties, tools, priorities");
    expect(String(messages[0].content)).toContain("Do not introduce commonly expected skills");
    expect(String(messages[0].content)).toContain("under approximately 620 words");
    expect(JSON.stringify(messages[1].content)).toContain("No job description was supplied.");
  });
});
