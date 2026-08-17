import { describe, expect, it } from "vitest";

const appId = process.env.ADZUNA_APP_ID;
const appKey = process.env.ADZUNA_APP_KEY;

describe("Adzuna credential configuration", () => {
  it(
    "authenticates a lightweight live-jobs query without exposing credentials to the client",
    async () => {
      expect(appId, "ADZUNA_APP_ID must be configured").toBeTruthy();
      expect(appKey, "ADZUNA_APP_KEY must be configured").toBeTruthy();

      const query = new URLSearchParams({
        app_id: appId!,
        app_key: appKey!,
        results_per_page: "1",
        what: "software engineer",
      });
      const response = await fetch(
        `https://api.adzuna.com/v1/api/jobs/gb/search/1?${query.toString()}`,
        { headers: { Accept: "application/json" } },
      );

      const responseBody = await response.text();
      expect(response.ok, responseBody).toBe(true);
      const payload = JSON.parse(responseBody) as { results?: unknown[] };
      expect(Array.isArray(payload.results)).toBe(true);
    },
    20_000,
  );
});
