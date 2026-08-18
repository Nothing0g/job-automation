/**
 * Parses a request Cookie header without allowing malformed percent encoding in
 * an unrelated cookie to abort an authentication request. A malformed value is
 * preserved verbatim; callers will then treat an invalid session token as
 * unsigned rather than throwing a server error.
 */
export function parseRequestCookies(header: string | undefined) {
  const parsed: Record<string, string> = {};

  for (const part of (header ?? "").split(";")) {
    const value = part.trim();
    const separator = value.indexOf("=");
    if (!value || separator <= 0) continue;

    const name = value.slice(0, separator);
    const rawValue = value.slice(separator + 1);
    try {
      parsed[name] = decodeURIComponent(rawValue);
    } catch {
      parsed[name] = rawValue;
    }
  }

  return parsed;
}
