import { describe, expect, it } from "vitest";
import { approvedResumeFilename, createApprovedResumeDocx } from "./resumeAttachment";

describe("approved resume attachment", () => {
  it("creates a non-empty DOCX from only the approved resume content", async () => {
    const bytes = await createApprovedResumeDocx("# Shubham Kumar\n## EXPERIENCE\n### Analyst\n- Built a factual workflow.", { email: "shubham@example.com", linkedin: "https://linkedin.com/in/shubham" });
    expect(bytes.byteLength).toBeGreaterThan(1_000);
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    expect(approvedResumeFilename("Brivo", "AI Product Intern")).toBe("brivo-ai-product-intern-approved-resume.docx");
  });
});
