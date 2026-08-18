# TiDB TLS Deployment Notes

## Verified findings

The failed Vercel build was caused by TiDB rejecting an insecure MySQL connection during `drizzle-kit migrate` (`HY000`, error `1105`). TiDB Cloud Starter and Essential permit only TLS connections for standard public-endpoint access. TiDB supports TLS 1.2 and TLS 1.3 and uses publicly trusted Let's Encrypt certificates, so a standard Node/Vercel root certificate store can verify the server certificate without a locally uploaded CA bundle.[1]

The Drizzle Kit configuration documentation supports explicit database connection parameters and TLS/SSL settings for database tooling.[2] The portable configuration must therefore express TLS explicitly for the migration client rather than relying on a manually constructed URI query parameter.

## Deployment decision

Keep the TiDB public endpoint, retain certificate verification, and configure the migration tool with TLS enabled. Do not disable certificate validation and do not upload a local Windows CA path to Vercel.

## Sources

[1] TiDB Cloud, [TLS Connections to TiDB Cloud Starter or Essential](https://docs.pingcap.com/tidbcloud/secure-connections-to-serverless-tier-clusters).

[2] Drizzle, [Drizzle Kit configuration file](https://orm.drizzle.team/docs/drizzle-config-file).
