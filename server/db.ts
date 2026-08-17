import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  ApplicationStatus,
  GmailConnection,
  InsertUser,
  JobContextMode,
  User,
  gmailConnections,
  jobs,
  masterProfiles,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { createOrReusePersonalUser } from "./lib/personalWorkspace";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach(field => {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  });
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  updateSet.role = values.role;
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

/** Maps direct personal access to the project owner's durable workspace record. */
export async function getPersonalUser() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return createOrReusePersonalUser<User>({
    ownerOpenId: ENV.ownerOpenId,
    find: async openId => (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0],
    create: async seed => { await db.insert(users).values(seed); },
  });
}

/** Creates the single durable workspace user used only outside the Manus runtime. */
export async function getOrCreatePortableOwner(email: string, name?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const normalizedEmail = email.trim().toLowerCase();
  const openId = `portable-google:${normalizedEmail}`;
  const existing = await getUserByOpenId(openId);
  if (existing) {
    await db.update(users).set({ email: normalizedEmail, name: name ?? existing.name, loginMethod: "google", role: "admin", lastSignedIn: new Date() }).where(eq(users.id, existing.id));
    return (await getUserByOpenId(openId))!;
  }
  await db.insert(users).values({ openId, email: normalizedEmail, name: name ?? "Private owner", loginMethod: "google", role: "admin", lastSignedIn: new Date() });
  return (await getUserByOpenId(openId))!;
}

export async function getGmailConnection(userId: number): Promise<GmailConnection | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(gmailConnections).where(eq(gmailConnections.userId, userId)).limit(1);
  return result[0];
}

export async function saveGmailConnection(userId: number, data: { encryptedRefreshToken: string; scopes: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(gmailConnections).values({ userId, ...data }).onDuplicateKeyUpdate({ set: { ...data, updatedAt: new Date() } });
  return getGmailConnection(userId);
}

export async function getMasterProfile(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(masterProfiles).where(eq(masterProfiles.userId, userId)).limit(1);
  return result[0] ?? null;
}

export async function saveMasterProfile(
  userId: number,
  data: { resumeText?: string; personalBio?: string; emailSignature?: string; contactLinks?: string; resumeFileKey?: string },
) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const current = await getMasterProfile(userId);
  if (current) {
    await db.update(masterProfiles).set({ ...data, updatedAt: new Date() }).where(eq(masterProfiles.userId, userId));
  } else {
    await db.insert(masterProfiles).values({
      userId,
      resumeText: data.resumeText ?? null,
      personalBio: data.personalBio ?? null,
      emailSignature: data.emailSignature ?? null,
      contactLinks: data.contactLinks ?? null,
      resumeFileKey: data.resumeFileKey ?? null,
    });
  }
  return getMasterProfile(userId);
}

export async function listJobs(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(jobs).where(eq(jobs.userId, userId)).orderBy(desc(jobs.updatedAt));
}

export async function getJobForUser(userId: number, jobId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId))).limit(1);
  return result[0];
}

export async function createJob(
  userId: number,
  data: {
    company: string;
    role: string;
    jobDescription: string;
    contextMode: JobContextMode;
    contactEmail?: string | null;
    sourceUrl?: string | null;
    status: ApplicationStatus;
    nextAction?: string | null;
    followUpAt?: Date | null;
  },
) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.insert(jobs).values({ userId, ...data });
  return getJobForUser(userId, Number(result[0].insertId));
}

export async function updateJobForUser(
  userId: number,
  jobId: number,
  data: Partial<{
    company: string;
    role: string;
    jobDescription: string;
    contextMode: JobContextMode;
    contactEmail: string | null;
    sourceUrl: string | null;
    status: ApplicationStatus;
    tailoredResume: string;
    tailoredResumeApprovedAt: Date | null;
    emailDraft: string;
    notes: string;
    nextAction: string | null;
    followUpAt: Date | null;
  }>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(jobs).set({ ...data, updatedAt: new Date() }).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
  return getJobForUser(userId, jobId);
}
