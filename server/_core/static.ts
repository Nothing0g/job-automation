import express, { type Express } from "express";
import fs from "fs";
import path from "path";

/**
 * Serves the compiled client in production environments, including Vercel
 * serverless functions. This module intentionally does not import Vite or the
 * development configuration so it remains safe to bundle as CommonJS.
 */
export function serveStatic(app: Express) {
  const configuredPath = process.env.STATIC_DIR;
  const projectBuildPath = path.resolve(process.cwd(), "dist", "public");
  const distPath = configuredPath ?? projectBuildPath;

  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // Fall through to the SPA document only after API and OAuth routes are registered.
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
