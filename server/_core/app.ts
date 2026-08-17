import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerPortableRoutes } from "../portable/routes";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";

/**
 * Creates the transport-independent API application used by both the local
 * Express listener and a Vercel serverless function. Static asset delivery is
 * deliberately installed by the runtime entry point, not by this factory.
 */
export function createApiApp() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
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
