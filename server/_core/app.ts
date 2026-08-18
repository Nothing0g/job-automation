import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerPortableRoutes } from "../portable/routes";
import { portableAuthEnabled } from "../portable/config";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { registerStorageProxy } from "./storageProxy";

/**
 * Creates the transport-independent API application used by both the local
 * Express listener and a Vercel serverless function. Static asset delivery is
 * deliberately installed by the runtime entry point, not by this factory.
 */
export async function createApiApp() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);

  // Portable Vercel deployments use the dedicated Google owner gate. Avoid
  // importing the managed-platform OAuth SDK there: its required platform
  // environment values do not exist in a portable installation.
  if (!portableAuthEnabled()) {
    const { registerOAuthRoutes } = await import("./oauth");
    registerOAuthRoutes(app);
  }

  registerPortableRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  return app;
}
