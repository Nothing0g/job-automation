import { describe, expect, it } from "vitest";
import { getTiDbCertificateVerifiedCredentials } from "./tidbTls";

describe("TiDB TLS credential conversion", () => {
  it("uses an explicit certificate-verifying mysql2 configuration for TiDB Cloud", () => {
    expect(
      getTiDbCertificateVerifiedCredentials(
        "mysql://owner%40example.com:pass%40word@gateway01.us-east-1.prod.aws.tidbcloud.com:4000/job_automation",
      ),
    ).toEqual({
      host: "gateway01.us-east-1.prod.aws.tidbcloud.com",
      port: 4000,
      user: "owner@example.com",
      password: "pass@word",
      database: "job_automation",
      ssl: { rejectUnauthorized: true },
    });
  });

  it("leaves non-TiDB URLs on their existing database path", () => {
    expect(
      getTiDbCertificateVerifiedCredentials("mysql://user:password@localhost:3306/job_automation"),
    ).toBeUndefined();
  });

  it("rejects a TiDB URL that does not name a database", () => {
    expect(() =>
      getTiDbCertificateVerifiedCredentials(
        "mysql://user:password@gateway01.us-east-1.prod.aws.tidbcloud.com:4000/",
      ),
    ).toThrow("must include a database name");
  });
});
