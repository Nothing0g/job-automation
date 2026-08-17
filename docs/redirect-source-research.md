# Redirect-first job discovery research

## Confirmed specialist source entry points

The redirect-first design will retain provider-owned search pages and avoid copying listings into the personal tracker. **Wellfound** exposes a startup-focused jobs entry point and describes candidate-side search filters, including remote preferences, salary/equity, job type, and role search. **YC’s Work at a Startup** is the official directory for roles at YC companies, while **YC Jobs** exposes category browsing. **Himalayas** and **Remote OK** are remote-first sources whose filters should remain controlled by their own interfaces after the user lands there.

| Source | Direct entry point | Intended role in the app |
|---|---|---|
| Wellfound | <https://wellfound.com/jobs> | Startup and venture-backed company roles. |
| YC Work at a Startup | <https://www.workatastartup.com/> | Early-stage YC-company openings. |
| YC Jobs | <https://www.ycombinator.com/jobs> | YC job categories and open roles. |
| Himalayas | <https://himalayas.app/jobs> | Remote-first roles. |
| Remote OK | <https://remoteok.com/> | Remote-first technology, design, and operations roles. |

## Browser-verified behavior

The current Wellfound jobs page exposes separate **Job title** and **Location** controls before its Search action. Browser testing showed that the location control requires a provider-native selected option rather than accepting arbitrary free text, and its text-query URL contract was not assumed. The redirect will therefore use observed Wellfound category routes for common mapped roles or its verified jobs entry point for other phrases. In contrast, YC Work at a Startup exposes readable role routes such as `/jobs/l/product-manager` and remote role routes such as `/jobs/r/product-manager`. The redirect builder can therefore use those exact paths for mapped common roles and fall back to YC’s verified board for other phrases or unsupported locations.

## Design boundary

Only URL filters that are verified through the provider’s live search behavior will be embedded. Where a provider does not publish a stable keyword/location URL contract, the redirect will open the provider’s verified jobs entry point with a clear note to apply its native filters there. This avoids presenting an invented or stale provider query as a guaranteed filter.

## References

[1] [Wellfound jobs](https://wellfound.com/jobs)

[2] [Wellfound search guidance](https://help.wellfound.com/article/777-setting-up-a-search)

[3] [YC Work at a Startup](https://www.workatastartup.com/)

[4] [YC Jobs](https://www.ycombinator.com/jobs)

[5] [Himalayas remote job guidance](https://himalayas.app/docs/how-to-get-a-remote-job)

[6] [Remote OK](https://remoteok.com/)
