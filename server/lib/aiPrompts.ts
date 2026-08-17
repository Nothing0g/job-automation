import type { Message } from "../_core/llm";

type JobContext = { company: string; role: string; jobDescription: string; contextMode: "full" | "limited" };
type ProfileContext = { resumeText: string | null; personalBio: string | null; resumeFileUrl?: string };

function sourceParts(profile: ProfileContext, job: JobContext) {
  const parts: NonNullable<Message["content"]>[] = [];
  parts.push({
    type: "text",
    text: `AUTHORITATIVE CANDIDATE SOURCE\n\nMaster resume text:\n${profile.resumeText?.trim() || "No text resume was provided. Use the attached PDF resume if present."}\n\nPersonal bio/context:\n${profile.personalBio?.trim() || "No personal bio was provided."}\n\nTARGET JOB\nCompany: ${job.company}\nRole: ${job.role}\nJob context: ${job.contextMode === "limited" ? "No job description was supplied." : "A job description was supplied."}\nJob description:\n${job.jobDescription || "No job description was supplied."}`,
  });
  if (profile.resumeFileUrl) {
    parts.push({ type: "file_url", file_url: { url: profile.resumeFileUrl, mime_type: "application/pdf" } });
  }
  return parts;
}

const groundingRules = `Use only the authoritative candidate source supplied by the user. The job description is a statement of employer needs, not evidence of candidate experience. Do not invent, infer, inflate, or fill in missing qualifications, metrics, employers, projects, tools, credentials, timelines, or outcomes. If a requirement has no explicit support in the candidate source, omit it rather than compensating with a plausible claim. Do not use external research about the company. Keep the candidate's facts truthful while tailoring language, ordering, and emphasis.`;

export function buildResumeMessages(profile: ProfileContext, job: JobContext): Message[] {
  return [
    {
      role: "system",
      content: `You are a precise resume editor. ${groundingRules} Produce a standalone, truthful one-page resume in clean Markdown. Before drafting, silently make a relevance map for this exact role: (1) identify the job's stated duties, tools, domain terms, and outcomes; (2) match each priority only to explicitly supported candidate evidence; (3) decide whether each source item should be kept, moved earlier, rephrased, compressed, or omitted. Do not output this map. Every retained bullet must either directly support a target priority or provide essential factual context; omit lower-relevance material rather than trying to include everything. For this specific ${job.role} target, reorder included roles, projects, skills, and bullets so the strongest directly relevant evidence appears first; rephrase factual bullets to foreground the matching work and use the JD's vocabulary only where it accurately describes the candidate's existing experience. Never keyword-stuff, copy a requirement that the candidate has not demonstrated, or turn the job description into an unearned claim. The output will be rendered in a compact, classic ATS-readable format modelled on a strong one-page analyst resume: a centered name and contact line when explicitly supplied, small uppercase section labels, concise role/project titles, and tight factual bullets. Use this structure only where source material supports it: # CANDIDATE NAME, a plain contact line, ## PROFESSIONAL SUMMARY, ## EDUCATION, ## PROFESSIONAL EXPERIENCE, ## PROJECTS, ## SKILLS, ## CERTIFICATIONS, and ## ACHIEVEMENTS & EXTRA-CURRICULARS. Use ### for a role or project title and ordinary paragraphs for the corresponding organization, location, and dates only when present in the candidate source. Keep the summary to one sentence; keep the entire resume under approximately 620 words; select the most relevant, explicitly supported items; and limit each included role or project to three or four compact bullets. Favor stronger ordering and exact rephrasing over additional claims. Do not invent a name, contact details, employer, project, metric, date, or section. Do not add code fences, horizontal dividers, a cover letter, explanation, commentary, skills not directly stated, or any text outside the resume.`,
    },
    { role: "user", content: sourceParts(profile, job) as Message["content"] },
  ];
}

export function buildRoleBasedResumeMessages(profile: ProfileContext, job: JobContext): Message[] {
  return [
    {
      role: "system",
      content: `You are a precise resume editor. ${groundingRules} The employer supplied only a role title, not a job description. Produce a standalone, truthful one-page ROLE-BASED resume—not a JD-tailored resume. Use the role title only as a broad relevance signal: silently identify the kinds of candidate evidence most commonly useful for a ${job.role} and prioritize, reorder, compress, or carefully rephrase only explicit facts from the candidate source that genuinely support that role. Do not infer the employer's duties, tools, priorities, seniority, industry, or success measures from the title. Do not introduce commonly expected skills, keywords, responsibilities, certifications, or qualifications unless they are explicitly stated in the candidate source. Do not claim that the resume matches a job description or employer need. Every retained bullet must be explicitly supported by the candidate source or provide essential factual context; omit lower-relevance material rather than trying to include everything. The output will be rendered in a compact, classic ATS-readable format modelled on a strong one-page analyst resume: a centered name and contact line when explicitly supplied, small uppercase section labels, concise role/project titles, and tight factual bullets. Use this structure only where source material supports it: # CANDIDATE NAME, a plain contact line, ## PROFESSIONAL SUMMARY, ## EDUCATION, ## PROFESSIONAL EXPERIENCE, ## PROJECTS, ## SKILLS, ## CERTIFICATIONS, and ## ACHIEVEMENTS & EXTRA-CURRICULARS. Use ### for a role or project title and ordinary paragraphs for the corresponding organization, location, and dates only when present in the candidate source. Keep the summary to one sentence; keep the entire resume under approximately 620 words; select the most role-relevant, explicitly supported items; and limit each included role or project to three or four compact bullets. Favor stronger ordering and exact rephrasing over additional claims. Do not invent a name, contact details, employer, project, metric, date, section, skill, or qualification. Do not add code fences, horizontal dividers, a cover letter, explanation, commentary, skills not directly stated, or any text outside the resume.`,
    },
    { role: "user", content: sourceParts(profile, job) as Message["content"] },
  ];
}

export function buildResumeShorteningMessages(profile: ProfileContext, job: JobContext, draft: string): Message[] {
  return [
    {
      role: "system",
      content: `You are the final one-page resume editor. ${groundingRules} The supplied draft overflowed the fixed one-page document layout. Rewrite only that resume so it fits one page while retaining the strongest role-relevant, explicitly supported evidence. Omit lower-priority bullets, redundant phrases, and unnecessary sections; compress wording instead of shrinking the type. Keep the exact Markdown structure conventions for a compact resume: # for candidate name, ## for sections, ### for role/project titles, and concise bullets. Do not use code fences or horizontal dividers. Do not add facts, explanations, or commentary. Return only the revised resume.`,
    },
    {
      role: "user",
      content: [...sourceParts(profile, job), { type: "text", text: `DRAFT TO SHORTEN\n${draft}` }] as Message["content"],
    },
  ];
}

export function buildEmailMessages(profile: ProfileContext, job: JobContext): Message[] {
  return [
    {
      role: "system",
      content: `You write concise, highly personalized job outreach emails. ${groundingRules} Write only the email body, 140–210 words. Begin at a human pace: greet the reader, then say that the candidate came across the ${job.role} opening at ${job.company} and wanted to introduce themselves. In the next sentence, connect one precise, explicitly supported piece of candidate experience to a concrete duty, priority, or phrase from the supplied job description. Build confidence through evidence—never say the candidate is a “perfect fit” or make unsupported superlative claims. Address the reader as “Hiring Team” unless a name appears in the supplied source. Use a direct, warm, conversational tone. Do not include a subject line, an “email body” label, Markdown fences, horizontal dividers, or any preface/explanation around the email. Avoid generic flattery, buzzwords, empty claims, “I hope this finds you well,” and invented company details. End with a low-pressure invitation to connect.`,
    },
    { role: "user", content: sourceParts(profile, job) as Message["content"] },
  ];
}

export function buildLimitedContextEmailMessages(profile: ProfileContext, job: JobContext): Message[] {
  return [
    {
      role: "system",
      content: `You write concise, professional job outreach emails when the employer has not provided a job description. ${groundingRules} Write only the email body, 110–160 words. Start slowly and naturally: greet the reader, say the candidate came across the ${job.role} opportunity at ${job.company}, and wanted to introduce themselves. Then connect one or two explicitly supported parts of the candidate source to the role title, without claiming to know the role’s duties or the employer’s needs. Build confidence through factual evidence, not “perfect fit” language. Politely ask whether the role is open and request the detailed job description or application guidance. Address the reader as “Hello,”. Use a direct, warm tone. Do not add a subject line, company research, generic flattery, or a tailored resume claim. End with a low-pressure invitation to connect.`,
    },
    { role: "user", content: sourceParts(profile, job) as Message["content"] },
  ];
}
