import { describe, expect, it } from "vitest";
import { allowlistedOwner, createOwnerSession, googleIdentityFromClaims, verifyOwnerSession } from "./ownerSession";

const secret = "portable-session-secret-that-is-longer-than-thirty-two-characters";

describe("portable owner session", () => {
  it("accepts only the verified allowlisted Google identity", () => {
    expect(allowlistedOwner("OWNER@example.com", "owner@example.com")).toBe(true);
    expect(() => googleIdentityFromClaims({ email: "other@example.com", sub: "google-subject", email_verified: true }, "owner@example.com")).toThrow(/not authorized/i);
    expect(() => googleIdentityFromClaims({ email: "owner@example.com", sub: "google-subject", email_verified: false }, "owner@example.com")).toThrow(/not authorized/i);
  });

  it("issues an expiring signed session only for the accepted identity", async () => {
    const identity = googleIdentityFromClaims({ email: "owner@example.com", sub: "google-subject", email_verified: true, name: "Owner" }, "owner@example.com");
    const token = await createOwnerSession(identity, secret);
    await expect(verifyOwnerSession(token, secret)).resolves.toEqual({ email: "owner@example.com", subject: "google-subject" });
    await expect(verifyOwnerSession(token, `${secret}-different`)).resolves.toBeNull();
  });
});
