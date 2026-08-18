const module = await import("../api/index.js");

if (typeof module.default !== "function") {
  throw new Error("api/index.js must export an invokable Vercel request handler");
}
