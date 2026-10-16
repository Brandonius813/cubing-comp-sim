# Private operations dashboard

The production application serves `/admin/`. The dashboard shares the existing account session but has no administrative authority in the browser. Every read goes through the `observability` Edge Function, which validates the bearer token with Supabase Auth. A private database function compares that user against the configured verified owner email. Neither anonymous nor ordinary authenticated roles can execute the dashboard RPC or read monitoring tables. The email allowlist and alert recipient are private database configuration, not frontend constants.

## Collection

- Visits: a random browser UUID and Chicago reporting date, plus referring hostname. No query strings, page contents, fingerprints, or IP addresses are retained. Multiple devices count separately. Refreshing increments pageviews, not unique visitors.
- Account activity: one row per authenticated account per Chicago date with a committed new solve. No solve times, scrambles, or histories. Imports and downloads do not activate accounts. Offline activity has a small best-effort seven-day outbox tied to the originating account; another account cannot receive it.
- Accounts: an aggregate daily ledger on auth insert/first email verification. Initial backfill contains accounts still present at installation; deleted historical accounts cannot be reconstructed.
- API observations: operation category, HTTP status and header-response latency from the browser. These are not full server logs or complete request totals.
- Diagnostics: fixed error categories only, never raw exception content.
- Five-minute health checks: website, API health and authentication health. Checks share Supabase infrastructure, so they do not independently detect a complete Supabase outage.

Collection is automatic, per the owner's October 16 instruction. Existing optional PostHog/Sentry controls apply only to those additional integrations. Privacy wording is updated in all sixteen catalogs. The dashboard itself does not record pageviews.

Visits/activity retain 180 days. Operational events and health samples retain 30 days. Signup daily aggregates remain. Deleted auth users cascade out of account activity. Dates are America/Chicago and the end date is inclusive; 7/30-day cards include today and the previous 6/29 dates. Reporting supports ranges up to 367 dates, but older raw traffic/activity may no longer exist.

## Deployment

Apply `deploy/observability.sql` once through the controlled database administrator connection. Configure the single `ccs_observe.config` row privately with the owner email and alert recipient. Deploy `supabase/functions/observability/index.ts` as the production `observability` Edge Function with gateway JWT validation disabled: it verifies user sessions itself, supports intentionally public visit ingestion, and requires an unguessable secret for scheduled probes. Its database RPCs are executable only by service_role.

Schedule a pg_cron job every five minutes using pg_net to POST `{action: 'monitor', secret: <private config monitor_secret>}`. Never embed the secret in source code or browser configuration. A daily database retention job removes expired records. The production instance has these jobs configured.

Frontend publication uses the existing successful main web-checks release pipeline. No credentials or administrator data are embedded in its static assets. `/admin/` responses request no-store/noindex; data responses are no-store and never enter the service-worker cache.

## Alert configuration and limitations

The monitor supports a dedicated Resend sending key and verified sender in private configuration. Without those, it records health and failures but explicitly reports that email alerts are not sending. Two consecutive failures trigger an alert attempt, with a six-hour repeat limit per service. Provider acceptance is not proof of inbox delivery.

Do not use a broad personal management credential to obtain or power this integration. During setup, automatic approval review rejected that expansion of credential access. Configure a narrowly scoped sending credential instead.

Not connected in this release: host CPU/memory/disk/container statistics; full server request logs; provider billing/bandwidth; email bounce statistics; backup/restore monitoring. The dashboard labels these unavailable and links to their existing consoles. Server SSH access was blocked by the execution environment. No new paid monitoring subscription or billing cap was enabled.
