import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";

const encoder = new TextEncoder();
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export type VerifiedGoogleIdentity = {
  email: string;
  name: string | null;
  subject: string;
};

export type OwnerSession = {
  email: string;
  subject: string;
};

function normalized(value: string) {
  return value.trim().toLowerCase();
}

function sessionKey(secret: string) {
  if (secret.trim().length < 32) {
    throw new Error("OWNER_SESSION_SECRET must be at least 32 characters.");
  }
  return encoder.encode(secret);
}

export function allowlistedOwner(email: string, ownerEmail: string) {
  return normalized(email) === normalized(ownerEmail);
}

export function googleIdentityFromClaims(
  claims: Record<string, unknown>,
  ownerEmail: string,
): VerifiedGoogleIdentity {
  const email = typeof claims.email === "string" ? normalized(claims.email) : "";
  const subject = typeof claims.sub === "string" ? claims.sub.trim() : "";
  const emailVerified = claims.email_verified === true || claims.email_verified === "true";
  const name = typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : null;

  if (!email || !subject || !emailVerified || !allowlistedOwner(email, ownerEmail)) {
    throw new Error("This Google account is not authorized for the personal workspace.");
  }

  return { email, name, subject };
}

export async function verifyGoogleOwnerToken(
  idToken: string,
  options: { clientId: string; ownerEmail: string },
): Promise<VerifiedGoogleIdentity> {
  if (!options.clientId || !options.ownerEmail) {
    throw new Error("Google owner authentication is not configured.");
  }

  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    audience: options.clientId,
    issuer: GOOGLE_ISSUERS,
  });

  return googleIdentityFromClaims(payload, options.ownerEmail);
}

export async function createOwnerSession(
  identity: VerifiedGoogleIdentity,
  secret: string,
): Promise<string> {
  return new SignJWT({ email: identity.email, subject: identity.subject })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("job-automation-studio")
    .setAudience("job-automation-owner")
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(sessionKey(secret));
}

export async function verifyOwnerSession(token: string, secret: string): Promise<OwnerSession | null> {
  try {
    const { payload } = await jwtVerify(token, sessionKey(secret), {
      issuer: "job-automation-studio",
      audience: "job-automation-owner",
    });
    const email = typeof payload.email === "string" ? normalized(payload.email) : "";
    const subject = typeof payload.subject === "string" ? payload.subject.trim() : "";
    return email && subject ? { email, subject } : null;
  } catch {
    return null;
  }
}
