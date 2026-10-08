# Authentication and observability

Status: implementation contract, October 8, 2026. Live services remain disabled until configured. The [main specification](architecture-spec.md) remains the product reference.

## Recommendation

Use Supabase Auth for accounts, a transactional email service for verification and password recovery, PostHog for explicit product events, Sentry for error reports, and Fastify/Pino for structured server logs.

The website remains usable without any of these services. Account failures cannot block local timing, manual entry, storage, or offline scrambling.

## Authentication options

An authentication provider manages who a user is. It should own password hashing, verification tokens, recovery tokens, and sessions. Our backend verifies the resulting session and decides which save the user may access. Emails are normal personal account data; passwords must be salted hashes, never retrievable plaintext.

These are the main practical choices for this project, not an exhaustive list of every vendor. The fit column is our architecture judgment.

| Option | Credential and recovery responsibility | Fit and trade-off |
|---|---|---|
| Supabase Auth, managed | Provider stores password hashes and runs verification/reset/session flows; configure production SMTP | Recommended because PostgreSQL is already proposed. We build the Figma account UI and retain the save API. |
| Firebase Authentication | Google-managed email/password identities, verification, reset, and provider SDKs | Strong alternative if moving the backend toward Firebase/Google. It can also protect a custom API; Firestore is not required. |
| Clerk | Managed identities with configurable sign-in and account flows | Fast account UI integration. Assess UI customization, native support, provider availability, and pricing before adoption. |
| Auth0 | Managed database identities, hosted login, reset links, and identity integrations | Suitable for more complex identity needs. More configuration/features than this consumer timer initially needs. |
| Amazon Cognito | AWS user pools, policies, salted password hashes, recovery codes, managed login | Logical in an AWS-first backend. Adds AWS configuration and recovery/email integration work. |
| Self-hosted Supabase Auth | Same general auth service under our infrastructure control | More control with substantial responsibility for upgrades, keys, mail, backups, availability, and incident response. |
| Better Auth | TypeScript library in our backend with database-backed identities and reset/email hooks | Best self-managed candidate if backend learning/control is the priority. Its default hashing is scrypt; configure email delivery and maintain the dependency and server. |
| Keycloak | Separate self-hosted identity server with administration, policies, and SMTP-based flows | Strong identity server, but a larger operational commitment than this app needs. |
| Custom password/session system | We own every cryptographic and security detail | Do not use. Writing app features is enough backend learning without inventing authentication protocols. |

Primary references: [Supabase](https://supabase.com/docs/guides/auth/passwords), [Supabase password storage](https://supabase.com/docs/guides/auth/password-security), [Firebase](https://firebase.google.com/docs/auth/web/password-auth), [Firebase account management](https://firebase.google.com/docs/auth/web/manage-users), [Clerk](https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options), [Auth0](https://auth0.com/docs/authenticate/database-connections/password-change), [Cognito](https://docs.aws.amazon.com/cognito/latest/developerguide/managing-users-passwords.html), [self-hosted Supabase](https://supabase.com/docs/guides/self-hosting/auth/config), [Better Auth](https://better-auth.com/docs/authentication/email-password), [Keycloak](https://www.keycloak.org/docs/latest/server_admin/).

Passwordless email links/codes, social login, and passkeys are alternative sign-in methods, not necessarily separate backend architectures. Email/password is the initial required flow; Google and WCA remain desired integrations. WCA provider compatibility requires an integration test. Preserve a stable app user ID independent of email/provider. Link accounts only after a verified flow, never solely because an email matches.

## Required account behavior

- Guest state is a local state, not a silently created anonymous cloud account.
- Signup, login, logout, recovery, and provider linking never upload, download, merge, or clear history.
- Email verification is required before cloud writes.
- Use password-manager-compatible fields and allow pasting. Match the provider's documented limits and show validation errors.
- A forgotten-password request returns a generic confirmation that does not reveal whether the email exists.
- The provider creates and validates expiring recovery credentials. We render the reset page and submit the new password through its SDK.
- Recovery redirects must be allowlisted for production and staging. Never use arbitrary caller-provided redirect URLs.
- Do not include analytics on pages while reset/OAuth credentials remain in their URL. Consume/remove credentials first, and exclude query strings from logs.
- Verify session revocation behavior after reset and provide sign-out of other sessions. Do not claim access tokens disappear instantly if they remain valid until expiry.
- Change-email requires the provider's verification flow. Account deletion requires a recent authenticated session.
- The backend validates issuer, audience, signature, expiry, and ownership before a save operation. Client-supplied user IDs are not authority.
- Keep service keys, signing credentials, database credentials, and mail credentials server-side.

Supabase documents password-reset and local email-testing flows. Its production SMTP guide says the default sender is restricted and not intended for production. Use a real mail provider before enabling public signup. [Password flows](https://supabase.com/docs/guides/auth/passwords), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## Email delivery

Choose Resend for an initial straightforward setup, or Postmark/SES if the existing account or cost/operations preference favors it. This choice does not change the application's save format.

Configure a dedicated auth sender, a real support address, SPF, DKIM, and DMARC. Verify provider domain status, use localized verification/reset templates, disable link tracking if it interferes with authentication links, and configure delivery-failure monitoring. Keep marketing separate.

Use a local mail catcher in development, test recipients in staging, and real sending credentials only in production. Rate-limit verification/resend/reset requests, avoid automatic retry storms, and test expiry, replay, invalid redirects, email scanners, delayed delivery, and users opening the link on a different browser.

## Product metrics

The aim is to understand adoption and reliability without collecting solve histories.

| Metric | Exact initial definition |
|---|---|
| Observed browser DAU | Unique consenting browser installation IDs with a newly committed attempt during a UTC calendar day. Imports, downloads, history views, and background heartbeats do not qualify. |
| Observed browser MAU | Same qualification, distinct IDs in the trailing 30 UTC dates, ending at the dashboard date. |
| Observed active accounts | Distinct consenting signed-in account analytics IDs qualifying in the same windows. Separate from browser metrics, never added to them. |
| Current accounts | Count of non-deleted app accounts in the authoritative identity store. Show verified and unverified separately. |
| New verified accounts | Accounts first verified in the period, deduplicated by app user ID. |
| Activation | First completed round per browser installation; account activation is reported separately. |
| D1/D7 retention | Activated identities that complete another round exactly 1/7 UTC days after activation, divided by activated identities in mature cohorts. |
| Round completion | Rounds completed within 24 hours of starting, divided by starts at least 24 hours old. Include event and input-mode breakdowns. |
| Cloud adoption | Verified accounts with a current committed save / current verified accounts. |
| Upload success | Committed logical uploads / accepted logical uploads; deduplicate idempotency IDs. Track cancellation and revision conflicts separately. |
| Download success | Locally validated/applied downloads / user-initiated logical downloads, observable only for consenting clients. |
| Reliability | Save/scramble errors per operation, startup/generation latency distributions, server 5xx rate, and auth-email failures. |

Browser installation IDs are random IDs created only after consent. They are not fingerprints or people. Clearing data creates a new ID; multiple devices can count separately. Never derive IDs from email addresses. Consenting account metrics can use a separate opaque per-account analytics ID. Do not retroactively join anonymous history to an account by default; reset the active identity at logout.

Metrics exclude people declining telemetry and may miss offline activity or blocked requests. Label them observed usage. Account counts from the operational identity database are exact within that system; they do not measure guest users.

UTC is the reporting boundary, not the user's display timezone. Retention uses original event dates, with the latest seven days marked provisional for late offline arrivals. Ignore impossible future timestamps and expose ingestion delay in the operational dashboard.

## Telemetry contract

Use explicit allowed events:

| Event | Trigger | Safe properties |
|---|---|---|
| round_started | Round state committed | Event ID, input mode, local random round token |
| attempt_recorded | A new attempt is durably saved | Event ID, input mode, random attempt token |
| round_completed | Final aggregate and state committed | Event ID, format, attempt count, round token |
| local_save_failed | Failed transaction | Stable error code, operation, app version |
| scramble_failed | Worker failure | Event ID, engine build ID, stable error code |
| offline_assets_ready | Version-complete cache verified | App/engine version |
| cloud_transfer_result | Logical transfer ends | Direction, outcome, size bucket, latency bucket, operation token |

No exact times, scrambles, comments, histories, email, names, passwords, cookies, authorization headers, reset links, form contents, or full URLs. Event/attempt tokens are random and are only used to deduplicate event delivery. Allowlist properties before sending.

Both product analytics and client diagnostics start off. Use separate settings toggles. Core functionality must work identically with both disabled. No blocking consent screen. Turning a toggle off drops queued events for that category and stops network delivery.

For opted-in telemetry, use a separate best-effort outbox capped at 1,000 events and seven days. Preserve occurrence time and event ID; retry with backoff when connected, drop oldest on overflow, and never block timing or save commits. Do not backfill earlier non-consented activity from local history.

PostHog supports property filtering and opt-out controls. Disable autocapture, session replay, screenshots, surveys, and automatic page/form capture. A project token does not activate collection without the consent/configuration gate. [PostHog privacy controls](https://github.com/PostHog/posthog.com/blob/master/contents/docs/product-analytics/privacy.mdx).

## Logs, errors, and alerts

Sentry is the initial error-tracking candidate. Capture handled critical persistence/engine errors plus uncaught exceptions. Use release versions and source maps so stack traces point to source code. Apply client-side sanitization before sending. Disable replay, attachments, unrestricted console breadcrumbs, and user email. The diagnostics toggle gates client reporting. A browser DSN is a public ingestion identifier; the source-map upload token is private.

Fastify/Pino emits JSON with severity, timestamp, request ID, route template, status, latency, release, and stable error code. Start with 14-day log retention and operator-only access. Do not log request bodies, query strings, cookies, bearer tokens, auth callbacks, passwords, histories, or full request objects. Configure redaction and use an allowlist serializer. [Fastify logging](https://fastify.dev/docs/latest/Reference/Logging/), [Sentry filtering](https://www.sentry.help/en/articles/13965217-javascript-how-do-i-filter-events-based-on-the-entire-stack-trace).

Essential server operational logs are separate from optional product analytics. State their purpose and retention in the privacy policy. Aggregate operational account/save counts without exporting emails to product analytics.

Start with:

- An external website and API uptime check.
- An alert on sustained 5xx errors or a sharp increase in local-save failures.
- An alert when scheduled backup or restore verification fails.
- Storage and vendor spending alerts.
- Email bounce/delivery-failure monitoring.
- One weekly adoption dashboard and one live operational dashboard.

Initial alerts go to Brandon's chosen channel. Do not create notification integrations or send messages until that destination is configured.

## Simpler alternatives

| Choice | Best use | Limitation for this project |
|---|---|---|
| PostHog + Sentry + logs | Product cohorts plus error debugging | Two vendors and explicit privacy/configuration work |
| PostHog analytics + its error tracking + logs | Fewer vendors | Evaluate error workflow and source-map handling before replacing Sentry |
| Plausible + Sentry + logs | Simple site traffic and custom goals | Less suited to the specified account/cohort analysis without extra work |
| Cloudflare Web Analytics + server counters | Basic traffic and performance with minimal setup | Cannot fully observe offline practice or provide the requested user retention alone |
| Self-hosted event tables plus SQL/Grafana | Backend learning and full control | We must build ingestion, deduplication, retention, dashboards, and operations |

These are implementation trade-offs, not claims that one product is universally better. [Plausible custom events](https://plausible.io/docs/custom-event-goals), [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/).

## Acceptance checks before enabling production

Prove that no telemetry request occurs with toggles off or keys absent. Inspect actual network payloads for all allowed events and failures. Test consent withdrawal, offline overflow, failed ingestion, duplicate delivery, identity changes, and separation from history storage. Verify recovery links and cloud ownership using two test accounts. Exercise real email delivery to multiple mail providers. Confirm that public builds contain no private credential and that server errors are useful without exposing user content.
