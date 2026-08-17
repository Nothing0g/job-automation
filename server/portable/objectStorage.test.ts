import { describe, expect, it } from "vitest";
import { portableObjectKey, portableObjectStorageConfig } from "./objectStorage";

describe("portable object storage contract", () => {
  it("requires all S3-compatible credentials before enabling the portable adapter", () => {
    expect(portableObjectStorageConfig({ S3_BUCKET: "resumes" })).toBeNull();
    expect(portableObjectStorageConfig({ S3_ENDPOINT: "https://example.r2.cloudflarestorage.com", S3_BUCKET: "resumes", S3_ACCESS_KEY_ID: "key", S3_SECRET_ACCESS_KEY: "secret" })).toMatchObject({ bucket: "resumes", region: "auto" });
  });

  it("explicitly disables object storage in portable mode when no external provider is configured", async () => {
    const { portableObjectStorageDisabled } = await import("./objectStorage");
    expect(portableObjectStorageDisabled({ PORTABLE_AUTH_ENABLED: "true" })).toBe(true);
    expect(portableObjectStorageDisabled({ PORTABLE_AUTH_ENABLED: "true", S3_ENDPOINT: "https://storage.example", S3_BUCKET: "resumes", S3_ACCESS_KEY_ID: "key", S3_SECRET_ACCESS_KEY: "secret" })).toBe(false);
    expect(portableObjectStorageDisabled({ PORTABLE_AUTH_ENABLED: "false" })).toBe(false);
  });

  it("normalizes only safe relative object keys", () => {
    expect(portableObjectKey("/owner/resume.pdf")).toBe("owner/resume.pdf");
    expect(() => portableObjectKey("../resume.pdf")).toThrow(/invalid/i);
  });
});
