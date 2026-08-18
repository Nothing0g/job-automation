import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getOrCreatePortableOwner } from "../db";
import { portableAuthEnabled, portableOAuthConfig } from "../portable/config";
import { verifyOwnerSession } from "../portable/ownerSession";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  const portableMode = portableAuthEnabled();

  if (!portableMode) {
    try {
      const { sdk } = await import("./sdk");
      user = await sdk.authenticateRequest(opts.req);
    } catch {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  if (!user && portableMode) {
    try {
      const config = portableOAuthConfig();
      const token = (opts.req.headers.cookie ?? "").split(";").map(value => value.trim()).find(value => value.startsWith("job_automation_owner="))?.slice("job_automation_owner=".length) ?? "";
      const session = await verifyOwnerSession(decodeURIComponent(token), config.ownerSessionSecret);
      if (session?.email === config.ownerEmail) user = await getOrCreatePortableOwner(session.email);
    } catch {
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
