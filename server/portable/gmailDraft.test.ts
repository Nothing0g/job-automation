import { describe, expect, it, vi } from "vitest";
import { base64Url, buildGmailDraftMime, createDraftOnly, isEligibleForApprovedResumeDraft } from "./gmailDraft";

const attachment = { filename: "Avery_Resume.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: new Uint8Array([1, 2, 3]) };

describe("portable Gmail draft provider", () => {
  it("requires a verified recipient, generated email, and approved resume before an attachment draft is eligible", () => {
    const eligible = { contactEmail: "hiring@example.com", emailDraft: "Hello hiring team", tailoredResume: "Candidate\nExperience", tailoredResumeApprovedAt: new Date("2026-08-17") };
    expect(isEligibleForApprovedResumeDraft(eligible)).toBe(true);
    expect(isEligibleForApprovedResumeDraft({ ...eligible, contactEmail: "" })).toBe(false);
    expect(isEligibleForApprovedResumeDraft({ ...eligible, emailDraft: null })).toBe(false);
    expect(isEligibleForApprovedResumeDraft({ ...eligible, tailoredResume: "" })).toBe(false);
    expect(isEligibleForApprovedResumeDraft({ ...eligible, tailoredResumeApprovedAt: null })).toBe(false);
  });

  it("builds a multipart attachment message and rejects header injection", () => {
    const mime = buildGmailDraftMime({ to: "hiring@example.com", subject: "Application", body: "Hello team", attachment });
    expect(mime).toContain("To: hiring@example.com");
    expect(mime).toContain("Content-Disposition: attachment; filename=\"Avery_Resume.docx\"");
    expect(mime).toContain("SGVsbG8gdGVhbQ==");
    expect(() => buildGmailDraftMime({ to: "hiring@example.com\r\nBcc: other@example.com", subject: "Application", body: "Hello", attachment })).toThrow(/line breaks/i);
    expect(base64Url("a+b/c=")).toBe("YStiL2M9");
  });

  it("calls only Gmail’s draft creation endpoint and never a send endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "draft-1", message: { id: "message-1" } }) });
    await expect(createDraftOnly("access-token", { to: "hiring@example.com", subject: "Application", body: "Hello team", attachment }, fetchImpl)).resolves.toEqual({ draftId: "draft-1", messageId: "message-1" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
      expect.objectContaining({ method: "POST" }),
    );
    expect(String(fetchImpl.mock.calls[0]?.[0])).not.toContain("/send");
  });
});
