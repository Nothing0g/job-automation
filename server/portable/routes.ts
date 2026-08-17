import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { getGmailConnection, getJobForUser, getMasterProfile, getOrCreatePortableOwner, saveGmailConnection } from "../db";
import { createDraftOnly, isEligibleForApprovedResumeDraft } from "./gmailDraft";
import { googleAuthorizationUrl, exchangeGoogleCode, gmailAccessToken } from "./googleOAuth";
import { encryptPortableSecret } from "./encryption";
import { portableAuthEnabled, portableOAuthConfig } from "./config";
import { createOwnerSession, verifyGoogleOwnerToken, verifyOwnerSession } from "./ownerSession";
import { approvedResumeFilename, createApprovedResumeDocx, type ResumeContactLinks } from "./resumeAttachment";

const SESSION_COOKIE = "job_automation_owner";
const OWNER_STATE_COOKIE = "job_automation_google_state";
const GMAIL_STATE_COOKIE = "job_automation_gmail_state";

function cookies(req: Request) {
  return Object.fromEntries((req.headers.cookie ?? "").split(";").map(value => value.trim()).filter(Boolean).map(value => { const index = value.indexOf("="); return index < 0 ? [value, ""] : [value.slice(0, index), decodeURIComponent(value.slice(index + 1))]; }));
}

function cookieOptions(req: Request) {
  const secure = req.protocol === "https" || String(req.headers["x-forwarded-proto"] ?? "").split(",").some(value => value.trim() === "https");
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };
}

function equalState(a: string | undefined, b: string | undefined) {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function requirePortable(req: Request, res: Response) {
  if (!portableAuthEnabled()) { res.status(404).json({ error: "Portable auth is not enabled." }); return null; }
  try { return portableOAuthConfig(); } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Portable auth is not configured." }); return null; }
}

async function requireOwner(req: Request, res: Response) {
  const config = requirePortable(req, res);
  if (!config) return null;
  const session = await verifyOwnerSession(cookies(req)[SESSION_COOKIE] ?? "", config.ownerSessionSecret);
  if (!session || session.email !== config.ownerEmail) { res.status(401).json({ error: "Sign in with the allowlisted Google account first." }); return null; }
  return { config, user: await getOrCreatePortableOwner(session.email) };
}

function parseLinks(value: string | null): ResumeContactLinks | undefined {
  if (!value) return undefined;
  try { return JSON.parse(value) as ResumeContactLinks; } catch { return undefined; }
}

function sameOrigin(req: Request, baseUrl: string) {
  const origin = req.headers.origin;
  return Boolean(origin) && origin === baseUrl;
}

export function registerPortableRoutes(app: Express) {
  app.get("/api/portable/auth/status", async (req, res) => {
    if (!portableAuthEnabled()) return res.json({ enabled: false, signedIn: true, gmailConnected: false });
    const config = requirePortable(req, res); if (!config) return;
    const session = await verifyOwnerSession(cookies(req)[SESSION_COOKIE] ?? "", config.ownerSessionSecret);
    if (!session || session.email !== config.ownerEmail) return res.json({ enabled: true, signedIn: false, gmailConnected: false });
    const user = await getOrCreatePortableOwner(session.email);
    const connection = await getGmailConnection(user.id);
    res.json({ enabled: true, signedIn: true, gmailConnected: Boolean(connection) });
  });

  app.get("/api/portable/auth/google", (req, res) => {
    const config = requirePortable(req, res); if (!config) return;
    const state = randomBytes(32).toString("base64url");
    res.cookie(OWNER_STATE_COOKIE, state, { ...cookieOptions(req), maxAge: 10 * 60 * 1000 });
    res.redirect(googleAuthorizationUrl(config, { state, gmail: false }));
  });

  app.get("/api/portable/auth/google/callback", async (req, res) => {
    const config = requirePortable(req, res); if (!config) return;
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!code || !equalState(state, cookies(req)[OWNER_STATE_COOKIE])) return res.status(400).send("Google sign-in could not be verified. Please try again.");
    try {
      const token = await exchangeGoogleCode(config, code, false);
      const identity = await verifyGoogleOwnerToken(token.id_token, { clientId: config.clientId, ownerEmail: config.ownerEmail });
      await getOrCreatePortableOwner(identity.email, identity.name);
      const session = await createOwnerSession(identity, config.ownerSessionSecret);
      res.clearCookie(OWNER_STATE_COOKIE, cookieOptions(req));
      res.cookie(SESSION_COOKIE, session, { ...cookieOptions(req), maxAge: 12 * 60 * 60 * 1000 });
      res.redirect("/");
    } catch (error) { res.status(403).send(error instanceof Error ? error.message : "Google sign-in failed."); }
  });

  app.post("/api/portable/auth/logout", (req, res) => {
    res.clearCookie(SESSION_COOKIE, cookieOptions(req));
    res.status(204).end();
  });

  app.get("/api/portable/gmail/connect", async (req, res) => {
    const owner = await requireOwner(req, res); if (!owner) return;
    const state = randomBytes(32).toString("base64url");
    res.cookie(GMAIL_STATE_COOKIE, state, { ...cookieOptions(req), maxAge: 10 * 60 * 1000 });
    res.redirect(googleAuthorizationUrl(owner.config, { state, gmail: true }));
  });

  app.get("/api/portable/gmail/callback", async (req, res) => {
    const owner = await requireOwner(req, res); if (!owner) return;
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!code || !equalState(state, cookies(req)[GMAIL_STATE_COOKIE])) return res.status(400).send("Gmail authorization could not be verified. Please try again.");
    try {
      const token = await exchangeGoogleCode(owner.config, code, true);
      if (!token.refresh_token) throw new Error("Google did not return a refresh token. Revoke this app in Google Account permissions, then connect Gmail again.");
      const identity = await verifyGoogleOwnerToken(token.id_token, { clientId: owner.config.clientId, ownerEmail: owner.config.ownerEmail });
      if (identity.email !== owner.config.ownerEmail) throw new Error("The Gmail account must match the signed-in owner account.");
      await saveGmailConnection(owner.user.id, { encryptedRefreshToken: encryptPortableSecret(token.refresh_token, owner.config.gmailTokenEncryptionKey), scopes: token.scope ?? "" });
      res.clearCookie(GMAIL_STATE_COOKIE, cookieOptions(req));
      res.redirect("/?gmail=connected");
    } catch (error) { res.status(403).send(error instanceof Error ? error.message : "Gmail authorization failed."); }
  });

  app.post("/api/portable/gmail/drafts/:jobId", async (req, res) => {
    const owner = await requireOwner(req, res); if (!owner) return;
    if (!sameOrigin(req, owner.config.baseUrl)) return res.status(403).json({ error: "Draft creation requires a same-origin request." });
    const jobId = Number(req.params.jobId);
    if (!Number.isSafeInteger(jobId) || jobId <= 0) return res.status(400).json({ error: "A valid application is required." });
    const job = await getJobForUser(owner.user.id, jobId);
    if (!job || !isEligibleForApprovedResumeDraft(job)) return res.status(400).json({ error: "A stored recipient, generated email, and approved resume are required before a draft can be created." });
    const recipient = job.contactEmail!.trim();
    const emailBody = job.emailDraft!;
    const approvedResume = job.tailoredResume!;
    const connection = await getGmailConnection(owner.user.id);
    if (!connection) return res.status(409).json({ error: "Connect Gmail before creating an attached draft." });
    try {
      const profile = await getMasterProfile(owner.user.id);
      const bytes = await createApprovedResumeDocx(approvedResume, parseLinks(profile?.contactLinks ?? null));
      const accessToken = await gmailAccessToken(owner.config, connection.encryptedRefreshToken);
      const draft = await createDraftOnly(accessToken, { to: recipient, subject: `Application for ${job.role} at ${job.company}`, body: emailBody, attachment: { filename: approvedResumeFilename(job.company, job.role), mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes } });
      res.status(201).json({ draftId: draft.draftId, messageId: draft.messageId });
    } catch (error) { res.status(502).json({ error: error instanceof Error ? error.message : "Gmail draft creation failed." }); }
  });
}
