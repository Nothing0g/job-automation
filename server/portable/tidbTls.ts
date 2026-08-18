export type CertificateVerifiedMySqlCredentials = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: { rejectUnauthorized: true };
};

function decodeUrlComponent(value: string) {
  return decodeURIComponent(value);
}

/**
 * TiDB Cloud Starter/Essential public endpoints accept only TLS connections.
 * Drizzle Kit 0.31 passes a URL directly to mysql2, which bypasses a separate
 * `ssl` setting. This converts a TiDB URL into explicit mysql2 credentials so
 * TLS and certificate verification are unambiguously enabled.
 */
export function getTiDbCertificateVerifiedCredentials(
  connectionString: string,
): CertificateVerifiedMySqlCredentials | undefined {
  const url = new URL(connectionString);
  const hostname = url.hostname.toLowerCase();

  if (url.protocol !== "mysql:" || !hostname.endsWith(".tidbcloud.com")) {
    return undefined;
  }

  const database = decodeUrlComponent(url.pathname.replace(/^\/+/, ""));
  if (!database) {
    throw new Error("TiDB DATABASE_URL must include a database name");
  }

  const user = decodeUrlComponent(url.username);
  const password = decodeUrlComponent(url.password);
  if (!user || !password) {
    throw new Error("TiDB DATABASE_URL must include a username and password");
  }

  const port = url.port ? Number(url.port) : 4000;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("TiDB DATABASE_URL has an invalid port");
  }

  return {
    host: url.hostname,
    port,
    user,
    password,
    database,
    ssl: { rejectUnauthorized: true },
  };
}
