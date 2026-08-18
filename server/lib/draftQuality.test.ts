import { describe, expect, it } from "vitest";
import { outreachDraftQualityIssue, resumeDraftQualityIssue } from "./draftQuality";

const masterResume = `SHUBHAM KUMAR
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

const completeResume = `# SHUBHAM KUMAR
Email · LinkedIn · GitHub
## PROFESSIONAL SUMMARY
Product-minded engineering student with structured analysis, user research, and data work experience focused on clear product decisions.
## EDUCATION
B.Tech Mechanical Engineering, Delhi Technological University, with coursework in structured problem solving and quantitative analysis.
## PROFESSIONAL EXPERIENCE
### Product Research Intern — Northstar Labs
- Interviewed users, mapped recurring workflows, and documented product requirements for review with cross-functional stakeholders.
- Synthesized observed friction points into a clear research record that supported practical iteration discussions.
## PROJECTS
### CultFit Fitness App Analytics
- Surveyed 20 users, organized qualitative feedback, and analyzed onboarding patterns to prioritize improvement opportunities.
- Presented research findings in a structured format that connected user evidence to an actionable product decision.
## SKILLS
SQL, Python, user research, product analytics, stakeholder communication, structured analysis, workflow mapping, and qualitative synthesis.`;

describe("draft quality safeguards", () => {
  it("rejects a summary-and-education-only resume when the saved profile supports fuller sections", () => {
    const incomplete = `# SHUBHAM KUMAR
Email
## PROFESSIONAL SUMMARY
Product-minded engineering student with structured analysis experience.
## EDUCATION
B.Tech Mechanical Engineering, Delhi Technological University.`;
    expect(resumeDraftQualityIssue(incomplete, masterResume)).toMatch(/too short|experience|projects|skills/);
    expect(resumeDraftQualityIssue(completeResume, masterResume)).toBeNull();
  });

  it("rejects generic or too-short outreach and accepts a factual saved-profile-grounded message", () => {
    const job = { company: "BLive", role: "Product Intern", contextMode: "limited" as const };
    expect(outreachDraftQualityIssue("Hello, I saw the Product Intern role at BLive. I am a good fit. Best, Shubham", masterResume, null, job)).toMatch(/shorter/);
    const completeEmail = `Hello,

I came across the Product Intern opportunity at BLive and wanted to introduce myself. During my Product Research Intern work at Northstar Labs, I interviewed users, mapped workflows, and turned those observations into documented product requirements. I also built a CultFit Fitness App Analytics project where I surveyed 20 users and analyzed their feedback to prioritize onboarding improvements.

Those experiences taught me to connect qualitative user evidence with structured analysis, while keeping the next product decision clear for stakeholders. I would appreciate the chance to learn whether the role is still open and, if so, review the detailed job description or application guidance.

Best,
Shubham Kumar`;
    expect(outreachDraftQualityIssue(completeEmail, masterResume, null, job)).toBeNull();
  });
});
