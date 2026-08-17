import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const applicationStatuses = [
  "to-apply",
  "applied",
  "interview",
  "offer",
  "rejected",
] as const;

export const jobContextModes = ["full", "limited"] as const;

export const masterProfiles = mysqlTable(
  "master_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    resumeText: text("resumeText"),
    resumeFileKey: varchar("resumeFileKey", { length: 512 }),
    personalBio: text("personalBio"),
    emailSignature: text("emailSignature"),
    contactLinks: text("contactLinks"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("master_profiles_user_unique").on(table.userId)],
);

export const jobs = mysqlTable(
  "jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    company: varchar("company", { length: 255 }).notNull(),
    role: varchar("role", { length: 255 }).notNull(),
    jobDescription: text("jobDescription").notNull(),
    contextMode: mysqlEnum("contextMode", jobContextModes).default("full").notNull(),
    contactEmail: varchar("contactEmail", { length: 320 }),
    sourceUrl: varchar("sourceUrl", { length: 2000 }),
    status: mysqlEnum("status", applicationStatuses).default("to-apply").notNull(),
    tailoredResume: text("tailoredResume"),
    tailoredResumeApprovedAt: timestamp("tailoredResumeApprovedAt"),
    emailDraft: text("emailDraft"),
    notes: text("notes"),
    nextAction: varchar("nextAction", { length: 500 }),
    followUpAt: timestamp("followUpAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("jobs_user_status_idx").on(table.userId, table.status),
    index("jobs_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const gmailConnections = mysqlTable(
  "gmail_connections",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    encryptedRefreshToken: text("encryptedRefreshToken").notNull(),
    scopes: text("scopes").notNull(),
    connectedAt: timestamp("connectedAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("gmail_connections_user_unique").on(table.userId)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type MasterProfile = typeof masterProfiles.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type GmailConnection = typeof gmailConnections.$inferSelect;
export type ApplicationStatus = (typeof applicationStatuses)[number];
export type JobContextMode = (typeof jobContextModes)[number];
