# TiDB TLS Deployment Notes

## Verified findings

The failed Vercel build was caused by TiDB rejecting an insecure MySQL connection during `drizzle-kit migrate` (`HY000`, error `1105`). TiDB Cloud Starter and Essential permit only TLS connections for standard public-endpoint access. TiDB supports TLS 1.2 and TLS 1.3 and uses publicly trusted Let's Encrypt certificates, so a standard Node/Vercel root certificate store can verify the server certificate without a locally uploaded CA bundle.[1]

The Drizzle Kit configuration documentation supports explicit database connection parameters and TLS/SSL settings for database tooling.[2] The portable configuration must therefore express TLS explicitly for the migration client rather than relying on a manually constructed URI query parameter.

## Deployment decision

Keep the TiDB public endpoint, retain certificate verification, and configure the migration tool with TLS enabled. Do not disable certificate validation and do not upload a local Windows CA path to Vercel.

## Redeployment evidence and revised diagnosis

Two earlier Vercel deployments used the pre-fix commit and failed with TiDB error `1105` (`HY000`), "Connections using insecure transport are prohibited." The deployment built from commit `bcec0f0`, which includes the explicit TLS credential conversion, reached TiDB securely and instead failed with MySQL error `1045` (`28000`), "Access denied ... (using password: YES)." This proves the encrypted, certificate-verified transport is now effective. The remaining blocker is the `DATABASE_URL` credential stored in Vercel, not the TLS implementation.

Reset the TiDB instance password from its **Connect** dialog if the original generated password was not retained, then copy its fresh full MySQL connection string exactly into Vercel's `DATABASE_URL` for the Production environment. Do not add quotes, do not substitute only the host, and do not change the port or username. TiDB’s connection dialog embeds a generated password in its connection string, and TiDB documents that the password can be reset there if needed.[1]

## Sources

[1] TiDB Cloud, [TLS Connections to TiDB Cloud Starter or Essential](https://docs.pingcap.com/tidbcloud/secure-connections-to-serverless-tier-clusters).

[2] Drizzle, [Drizzle Kit configuration file](https://orm.drizzle.team/docs/drizzle-config-file).
