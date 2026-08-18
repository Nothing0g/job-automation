import { describe, expect, it } from "vitest";
import { parseRequestCookies } from "./cookies";

describe("parseRequestCookies", () => {
  it("decodes valid cookie values", () => {
    expect(parseRequestCookies("owner=first%40example.com; theme=dark")).toEqual({
      owner: "first@example.com",
      theme: "dark",
    });
  });

  it("preserves malformed values so unrelated cookies cannot crash portable authentication", () => {
    expect(parseRequestCookies("analytics=%E0%A4%A; job_automation_owner=valid-token")).toEqual({
      analytics: "%E0%A4%A",
      job_automation_owner: "valid-token",
    });
  });

  it("does not manufacture values from cookie fragments without a name-value separator", () => {
    expect(parseRequestCookies("flag; =ignored; job_automation_owner=token")).toEqual({
      job_automation_owner: "token",
    });
  });
});
