# In-app live job listings: provider assessment

## Scope

The requested experience is to render current job cards **inside Job Automation Studio**, not to scrape or copy individual job-board pages. This requires a provider-approved job-data API; the available API catalog did not contain a built-in job-listings provider during this assessment.

## Viable options

| Option | What the app can show | Access requirement | Fit for role + location search |
|---|---|---|---|
| **Adzuna API** | Current job-ad search results from Adzuna’s database, with fields the provider returns and an application URL. | An Adzuna `app_id` and `app_key` are required for every request. | **Strong.** Its documented jobs search endpoint is suited to a server-side role/location query once the owner creates an API application. |
| **The Muse API** | Current listings from The Muse, with provider-supported category, experience-level, and location filters. | Testing is available without a key at a lower limit; registration and an API key are required beyond testing. | **Limited.** The official endpoint documents structured filters rather than a free-text role keyword parameter, so it is not a complete substitute for a general role search. |
| **JSearch** | Aggregated current job data with source/apply-link fields, subject to the provider’s response and plan. | A provider account/API key is needed. | **Strong.** Its published materials describe multi-source, real-time listing data, but it adds a third-party paid/free-plan dependency. |

## Recommended decision process

Use **Adzuna** when the priority is a focused role-and-location search rendered inside this app with a first-party job-data source. Use **The Muse** only as a limited, no-key prototype or a curated supplementary feed. Choose **JSearch** only if the user explicitly accepts a third-party aggregator account and its plan terms for wider cross-source coverage.

Regardless of provider, the implementation will keep the provider’s title, company, location, posting date when available, concise source-returned description excerpt, and an **Apply on original site** link. It will not fabricate, store, or claim completeness for external listings. API credentials will remain server-side, and the user will retain the existing manual application and email-send controls.

## Sources

1. [Adzuna API overview](https://developer.adzuna.com/overview) — documents the REST API, job-search endpoint shape, and mandatory `app_id`/`app_key` parameters.
2. [The Muse API v2](https://www.themuse.com/developers/api/v2) — documents the public Jobs endpoint, pagination, structured filters, registration requirement beyond testing, and rate limits.
3. [JSearch API](https://www.openwebninja.com/api/jsearch) — describes multi-source job data and published job/apply-link response fields.
