import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("portable Vercel deployment contract", () => {
  it("runs reviewed Drizzle migrations before building the serverless application", () => {
    const vercelConfig = JSON.parse(
      readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"),
    ) as { buildCommand?: string };

    expect(vercelConfig.buildCommand).toBe("pnpm drizzle-kit migrate && pnpm build");
  });
});
