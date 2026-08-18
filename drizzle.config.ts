import { defineConfig } from "drizzle-kit";
import { getTiDbCertificateVerifiedCredentials } from "./server/portable/tidbTls";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

// Drizzle Kit 0.31 forwards URL credentials directly to mysql2, so an `ssl`
// sibling would be ignored. TiDB Cloud uses explicit credentials to retain TLS
// and normal certificate verification during migrations.
const tidbCredentials = getTiDbCertificateVerifiedCredentials(connectionString);

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: tidbCredentials ?? { url: connectionString },
});
