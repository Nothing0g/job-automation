export type PortableOAuthConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  ownerEmail: string;
  ownerSessionSecret: string;
  gmailTokenEncryptionKey: string;
};

function required(env: NodeJS.ProcessEnv, key: keyof NodeJS.ProcessEnv) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required when portable authentication is enabled.`);
  return value;
}

export function portableAuthEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.PORTABLE_AUTH_ENABLED === "true";
}

export function portableGeminiApiKey(env: NodeJS.ProcessEnv = process.env) {
  const value = env.GEMINI_API_KEY?.trim();
  if (!value) throw new Error("GEMINI_API_KEY is required when portable resume and email drafting is enabled.");
  return value;
}

export function portableGroqApiKey(env: NodeJS.ProcessEnv = process.env) {
  return env.GROQ_API_KEY?.trim() || null;
}

export function portableOAuthConfig(env: NodeJS.ProcessEnv = process.env): PortableOAuthConfig {
  const baseUrl = required(env, "PORTABLE_APP_BASE_URL").replace(/\/$/, "");
  if (!/^https?:\/\//.test(baseUrl)) throw new Error("PORTABLE_APP_BASE_URL must begin with http:// or https://.");
  return {
    baseUrl,
    clientId: required(env, "GOOGLE_OAUTH_CLIENT_ID"),
    clientSecret: required(env, "GOOGLE_OAUTH_CLIENT_SECRET"),
    ownerEmail: required(env, "OWNER_GOOGLE_EMAIL").toLowerCase(),
    ownerSessionSecret: required(env, "OWNER_SESSION_SECRET"),
    gmailTokenEncryptionKey: required(env, "GMAIL_TOKEN_ENCRYPTION_KEY"),
  };
}

export function portableRedirect(config: PortableOAuthConfig, path: "/api/portable/auth/google/callback" | "/api/portable/gmail/callback") {
  return `${config.baseUrl}${path}`;
}
