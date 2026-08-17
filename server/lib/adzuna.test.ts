import { describe, expect, it } from "vitest";
import { buildAdzunaSearchUrl, toLiveJob } from "./adzuna";

describe("Adzuna live-job adapter", () => {
  it("creates a role and location query while preserving credentials on the server URL only", () => {
    const url = new URL(buildAdzunaSearchUrl({
      role: "  Product   Analyst ",
      location: " Bengaluru ",
      market: "in",
      appId: "test-id",
      appKey: "test-key",
    }));

    expect(url.pathname).toBe("/v1/api/jobs/in/search/1");
    expect(url.searchParams.get("what")).toBe("Product Analyst");
    expect(url.searchParams.get("where")).toBe("Bengaluru");
    expect(url.searchParams.get("results_per_page")).toBe("12");
  });

  it("maps safe display fields from a provider result and strips description markup", () => {
    expect(toLiveJob({
      id: 91,
      title: "Product Analyst",
      company: { display_name: "Acme & Co" },
      location: { display_name: "Bengaluru" },
      description: "<p>Shape&nbsp;insights &amp; reporting.</p>",
      redirect_url: "https://jobs.example.test/apply/91",
      created: "2026-08-17T00:00:00Z",
      contract_type: "full_time",
      category: { label: "IT Jobs" },
      salary_min: 800000,
      salary_max: 1200000,
      salary_currency: "INR",
    })).toEqual({
      id: "91",
      title: "Product Analyst",
      company: "Acme & Co",
      location: "Bengaluru",
      description: "Shape insights & reporting.",
      applyUrl: "https://jobs.example.test/apply/91",
      postedAt: "2026-08-17T00:00:00Z",
      contractType: "full_time",
      category: "IT Jobs",
      salaryMin: 800000,
      salaryMax: 1200000,
      currency: "INR",
    });
  });

  it("drops incomplete provider results that cannot safely lead to an application", () => {
    expect(toLiveJob({ id: 2, title: "", redirect_url: "https://jobs.example.test/apply/2" })).toBeNull();
    expect(toLiveJob({ id: 3, title: "Data Analyst" })).toBeNull();
  });
});
