import { describe, expect, it } from "vitest";
import { portableRawResumeFilesAllowed, portableResumeTextRequired } from "./filePolicy";

describe("portable no-R2 file policy", () => {
  it("disables raw resume-file storage only in portable mode", () => {
    expect(portableRawResumeFilesAllowed({ PORTABLE_AUTH_ENABLED: "false" })).toBe(true);
    expect(portableRawResumeFilesAllowed({ PORTABLE_AUTH_ENABLED: "true" })).toBe(false);
  });

  it("requires pasted resume text for portable drafting", () => {
    expect(portableResumeTextRequired({ PORTABLE_AUTH_ENABLED: "true" })).toBe(true);
    expect(portableResumeTextRequired({ PORTABLE_AUTH_ENABLED: "false" })).toBe(false);
  });
});
