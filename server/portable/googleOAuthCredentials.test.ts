import { describe, expect, it } from "vitest";

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const baseUrl = process.env.PORTABLE_APP_BASE_URL;

describe("portable Google OAuth credentials", () => {
  it("is accepted by Google before an authorization code is exchanged", async () => {
    expect(clientId, "GOOGLE_OAUTH_CLIENT_ID must be configured").toBeTruthy();
    expect(clientSecret, "GOOGLE_OAUTH_CLIENT_SECRET must be configured").toBeTruthy();
    expect(baseUrl, "PORTABLE_APP_BASE_URL must be configured").toBeTruthy();

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId!,
        client_secret: clientSecret!,
        code: "portable-credential-probe",
        grant_type: "authorization_code",
        redirect_uri: `${baseUrl!.replace(/\/$/, "")}/api/portable/auth/google/callback`,
      }),
    });
    const payload = await response.json() as { error?: string };

    // The code is intentionally invalid. A valid configured client reaches the
    // grant-validation stage; invalid client credentials fail as invalid_client.
    expect(payload.error).toBe("invalid_grant");
  }, 20_000);
});
