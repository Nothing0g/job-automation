import { describe, expect, it } from "vitest";
import { portableFileUploadEnabled } from "./portableRuntime";

describe("portable runtime client policy", () => {
  it("hides file upload only when portable owner access is enabled", () => {
    expect(portableFileUploadEnabled("true")).toBe(false);
    expect(portableFileUploadEnabled("false")).toBe(true);
  });
});
