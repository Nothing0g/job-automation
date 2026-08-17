import { decryptPortableSecret } from "./encryption";
import { type PortableOAuthConfig, portableRedirect } from "./config";

export const OWNER_SCOPE = ["openid", "email", "profile"];
export const GMAIL_DRAFT_SCOPES = [...OWNER_SCOPE, "https://www.googleapis.com/auth/gmail.compose"];

export function googleAuthorizationUrl(config: PortableOAuthConfig, options: { state: string; gmail: boolean }) {
  const callback = portableRedirect(config, options.gmail ? "/api/portable/gmail/callback" : "/api/portable/auth/google/callback");
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: callback,
    response_type: "code",
    scope: (options.gmail ? GMAIL_DRAFT_SCOPES : OWNER_SCOPE).join(" "),
    state: options.state,
    access_type: "offline",
    prompt: options.gmail ? "consent" : "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(config: PortableOAuthConfig, code: string, gmail: boolean, fetchImpl: typeof fetch = fetch) {
  const callback = portableRedirect(config, gmail ? "/api/portable/gmail/callback" : "/api/portable/auth/google/callback");
  const response = await fetchImpl("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: callback, grant_type: "authorization_code" }) });
  const payload = await response.json() as { access_token?: string; refresh_token?: string; id_token?: string; scope?: string; error?: string };
  if (!response.ok || !payload.access_token || !payload.id_token) throw new Error(payload.error ?? "Google OAuth exchange failed.");
  return payload as Required<Pick<typeof payload, "access_token" | "id_token">> & typeof payload;
}

export async function gmailAccessToken(config: PortableOAuthConfig, encryptedRefreshToken: string, fetchImpl: typeof fetch = fetch) {
  const refreshToken = decryptPortableSecret(encryptedRefreshToken, config.gmailTokenEncryptionKey);
  const response = await fetchImpl("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }) });
  const payload = await response.json() as { access_token?: string; error?: string };
  if (!response.ok || !payload.access_token) throw new Error(payload.error ?? "Unable to refresh Gmail access.");
  return payload.access_token;
}
