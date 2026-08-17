import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { portableAuthEnabled, portableOAuthConfig, portableRedirect } from "./config";
import { decryptPortableSecret, encryptPortableSecret } from "./encryption";

const env = {
  PORTABLE_AUTH_ENABLED: "true",
  PORTABLE_APP_BASE_URL: "https://private.example.com/",
  GOOGLE_OAUTH_CLIENT_ID: "client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
  OWNER_GOOGLE_EMAIL: "OWNER@example.com",
  OWNER_SESSION_SECRET: "session-secret-that-is-longer-than-thirty-two-characters",
  GMAIL_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
};

describe("portable runtime configuration", () => {
  it("enables only by explicit opt-in and derives exact callback URLs", () => {
    expect(portableAuthEnabled({})).toBe(false);
    expect(portableAuthEnabled(env)).toBe(true);
    const config = portableOAuthConfig(env);
    expect(config.ownerEmail).toBe("owner@example.com");
    expect(portableRedirect(config, "/api/portable/gmail/callback")).toBe("https://private.example.com/api/portable/gmail/callback");
  });

  it("encrypts refresh tokens with authenticated encryption", () => {
    const encrypted = encryptPortableSecret("refresh-token", env.GMAIL_TOKEN_ENCRYPTION_KEY);
    expect(encrypted).not.toContain("refresh-token");
    expect(decryptPortableSecret(encrypted, env.GMAIL_TOKEN_ENCRYPTION_KEY)).toBe("refresh-token");
    expect(() => decryptPortableSecret(encrypted, randomBytes(32).toString("base64"))).toThrow();
  });
});
