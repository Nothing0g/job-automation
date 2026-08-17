import { createApiApp } from "../server/_core/app";
import { serveStatic } from "../server/_core/vite";

const app = createApiApp();

// Vercel invokes this exported Express handler. `serveStatic` is kept after
// all API/OAuth routes so callback endpoints cannot be swallowed by the SPA.
serveStatic(app);

export default app;
