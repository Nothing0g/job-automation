import type { IncomingMessage, ServerResponse } from "node:http";
import type { Express } from "express";

let application: Express | undefined;
let initialization: Promise<Express> | undefined;

/**
 * Creates the Express application only when Vercel invokes the function.
 *
 * Delaying module loading lets a production runtime report a boot failure to
 * Vercel logs instead of failing before this handler is able to respond. The
 * error returned to a browser deliberately contains no environment details.
 */
export async function initializeApiApp(): Promise<Express> {
  if (application) return application;

  if (!initialization) {
    initialization = Promise.all([
      import("../server/_core/app"),
      import("../server/_core/vite"),
    ])
      .then(([{ createApiApp }, { serveStatic }]) => {
        const app = createApiApp();

        // Static delivery remains after API/OAuth routes so callback endpoints
        // cannot be swallowed by the SPA fallback.
        serveStatic(app);
        application = app;
        return app;
      })
      .catch((error: unknown) => {
        initialization = undefined;
        console.error("[Vercel API bootstrap] Failed to initialize the application", error);
        throw error;
      });
  }

  return initialization;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await initializeApiApp();
    return app(req as never, res as never);
  } catch (error) {
    console.error("[Vercel API bootstrap] Request could not be served", error);

    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "The application could not start. Check the server logs." }));
    }
  }
}
