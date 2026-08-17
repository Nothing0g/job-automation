export type GmailDraftAttachment = {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
};

export type GmailDraftRequest = {
  to: string;
  subject: string;
  body: string;
  attachment: GmailDraftAttachment;
};

export type CreatedGmailDraft = {
  draftId: string;
  messageId: string;
};

export type AttachmentDraftEligibility = {
  contactEmail: string | null | undefined;
  emailDraft: string | null | undefined;
  tailoredResume: string | null | undefined;
  tailoredResumeApprovedAt: Date | number | null | undefined;
};

/** A Gmail attachment may only be drafted from a reviewed resume, never a raw AI draft. */
export function isEligibleForApprovedResumeDraft(job: AttachmentDraftEligibility) {
  return Boolean(
    job.contactEmail?.trim() &&
      job.emailDraft?.trim() &&
      job.tailoredResume?.trim() &&
      job.tailoredResumeApprovedAt,
  );
}

function rejectHeaderBreaks(value: string, field: string) {
  if (/\r|\n/.test(value)) throw new Error(`${field} cannot contain line breaks.`);
  return value.trim();
}

function encoded(value: string | Uint8Array) {
  const buffer = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
  return buffer.toString("base64");
}

function wrappedBase64(value: string | Uint8Array) {
  return encoded(value).match(/.{1,76}/g)?.join("\r\n") ?? "";
}

export function base64Url(value: string | Uint8Array) {
  return encoded(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function buildGmailDraftMime(request: GmailDraftRequest, boundary = "job-automation-boundary") {
  const to = rejectHeaderBreaks(request.to, "Recipient");
  const subject = rejectHeaderBreaks(request.subject, "Subject");
  const filename = rejectHeaderBreaks(request.attachment.filename, "Attachment filename");
  const mimeType = rejectHeaderBreaks(request.attachment.mimeType, "Attachment type");

  if (!to || !subject || !request.body.trim() || !filename || !mimeType || request.attachment.bytes.byteLength === 0) {
    throw new Error("A recipient, subject, body, and non-empty approved resume attachment are required.");
  }

  return [
    "MIME-Version: 1.0",
    `To: ${to}`,
    `Subject: =?UTF-8?B?${encoded(subject)}?=`,
    `Content-Type: multipart/mixed; boundary=\"${boundary}\"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrappedBase64(request.body),
    `--${boundary}`,
    `Content-Type: ${mimeType}; name=\"${filename}\"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename=\"${filename}\"`,
    "",
    wrappedBase64(request.attachment.bytes),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

export async function createDraftOnly(
  accessToken: string,
  request: GmailDraftRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<CreatedGmailDraft> {
  if (!accessToken.trim()) throw new Error("A Gmail OAuth access token is required to create a draft.");
  const raw = base64Url(buildGmailDraftMime(request));
  const response = await fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { raw } }),
  });

  if (!response.ok) {
    throw new Error(`Gmail draft creation failed (${response.status}).`);
  }

  const payload = await response.json() as { id?: string; message?: { id?: string } };
  if (!payload.id || !payload.message?.id) throw new Error("Gmail returned an invalid draft response.");
  return { draftId: payload.id, messageId: payload.message.id };
}
