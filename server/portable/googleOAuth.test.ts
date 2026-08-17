import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { portableOAuthConfig } from "./config";
import { GMAIL_DRAFT_SCOPES, gmailAccessToken, googleAuthorizationUrl } from "./googleOAuth";
import { encryptPortableSecret } from "./encryption";

const config = portableOAuthConfig({ PORTABLE_APP_BASE_URL: "https://private.example.com", GOOGLE_OAUTH_CLIENT_ID: "client", GOOGLE_OAUTH_CLIENT_SECRET: "secret", OWNER_GOOGLE_EMAIL: "owner@example.com", OWNER_SESSION_SECRET: "x".repeat(40), GMAIL_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64") });

describe("portable Google OAuth helpers", () => {
  it("requests exactly the owner identity and draft-only Gmail scopes", () => {
    const url = new URL(googleAuthorizationUrl(config, { state: "nonce", gmail: true }));
    expect(url.searchParams.get("scope")).toBe(GMAIL_DRAFT_SCOPES.join(" "));
    expect(url.searchParams.get("redirect_uri")).toBe("https://private.example.com/api/portable/gmail/callback");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("uses the encrypted refresh token only to obtain a Gmail access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "short-lived-token" }), { status: 200 }));
    await expect(gmailAccessToken(config, encryptPortableSecret("refresh", config.gmailTokenEncryptionKey), fetchMock)).resolves.toBe("short-lived-token");
    expect(fetchMock).toHaveBeenCalledWith("https://oauth2.googleapis.com/token", expect.objectContaining({ method: "POST" }));
  });
});
