# Access and service setup

Status: October 9, 2026. No live account, production secret, or deployment is asserted by this document.

The local website, competition logic, browser persistence, file export/import, offline engine work, and automated tests can proceed without production account access.

## Access needed for hosted features

Use accounts owned by Brandon or the project organization. Prefer an existing connector, organization invitation, or scoped deployment credentials. Do not paste personal passwords, two-factor recovery codes, or account-wide root keys into chat.

| Service | What is needed | Where private values belong |
|---|---|---|
| GitHub | Intended repository and write/PR permission; existing connector if available | Connected account or host credential store; Actions secrets for deployment |
| Domain/DNS | Registrar/DNS provider for cubingcompsim.com; ability to add records | Provider dashboard or narrowly scoped DNS token |
| Cloudflare Pages | Project/account access and Git integration or scoped Pages deployment token | CI secret; account/project IDs may be ordinary config |
| Cloudflare R2 | Separate private staging/production buckets, endpoint, bucket-scoped read/write runtime credentials | Backend secret store; never the browser |
| Supabase | Separate staging/production project URLs and public client keys; backend verification/admin capability as required | Public URL/key in frontend config; admin/secret/database keys server-only |
| Transactional email | Resend, Postmark, or SES account; verified sender/domain; production SMTP settings | Supabase SMTP settings or backend secret store |
| Cloud API host | VPS/managed runtime account and project access | Host's deployment secrets; key-based access rather than personal password |
| Google login | Google Cloud OAuth client and allowed callback origins | Public client ID in configuration; secret on the identity provider/server |
| WCA login | WCA application registration, client ID/secret and callback approval/configuration | Secret on the identity provider/server; compatibility must be tested |
| PostHog | Project token, ingestion host/region, operator access to dashboard | Public ingestion token in frontend config; management token private if ever needed |
| Sentry | Project DSN plus optional release/source-map upload token | DSN may be public; upload token only in CI |
| Alerts | Brandon's chosen destination and incident owner | Provider notification settings; private webhook in secrets if used |

Email/password alone can launch before Google/WCA if those registrations lag, provided that choice is explicitly recorded. Do not show a working social-login button before its integration works. Do not show upload/download success when the real backend is absent.

Apple and Google Play developer accounts are not needed now. Native apps begin only after the website is stable.

For the current owner-specific provider explanations and guest-preview-first checklist, use [Preview and environments](preview-and-environments.md).

## Recommended setup order

1. Confirm the existing GitHub repository and keep code changes in a reviewable branch.
2. Finish and verify the local guest website, with mandatory fresh offline generation for every included event.
3. Create a Cloudflare guest preview from the verified CI artifact, then configure isolated staging auth, database, bucket, and API hosting when ready to test cloud features.
4. Configure auth SMTP and test verification/recovery delivery.
5. Configure upload/download authorization and atomic replacement; run two-account and two-device tests.
6. Configure telemetry projects, consent gating, privacy settings, budgets, and alert destination.
7. Add production resources, custom domain, privacy/support pages, backups, and CI deployment configuration.
8. Promote a verified build and run live smoke tests.

The production setup is concrete work, not a prerequisite to continuing the local build.

## Public versus secret configuration

Browser-visible configuration includes the API base URL, Supabase project URL/public key, PostHog ingestion project token/host, Sentry DSN, and build ID. Being public does not make these authorization mechanisms; database and storage policies must enforce access.

Keep Supabase admin/service keys, database URLs with credentials, R2 access secrets, SMTP/API mail secrets, OAuth client secrets, deployment tokens, and source-map upload tokens out of client bundles. Do not prefix private values with VITE_ or another framework's public-env prefix.

Local private configuration belongs in ignored environment files. Production values belong in the host/CI secret manager. Commit only empty configuration examples. Never print populated secrets during debugging. Rotate temporary provisioning tokens after setup where practical.

## One cloud save, no history feature

Each account exposes one current save. Upload creates a pending object, validates it, and atomically switches the current pointer. An old object can remain briefly for an in-flight download, then is deleted. Abandoned pending uploads expire within 24 hours.

Infrastructure backups are separate from the app's save feature. Define backup frequency, retention, restore procedure, and deletion handling. Do not preserve ten complete application snapshots per user as an undeclared product feature.

## Required deployment records

Record resource owners, environment names, canonical origin, auth redirect URLs, bucket names, secret locations, deployment procedure, backup schedule, and alert destination. Record secret names and locations only, never their values. Keep staging resources isolated from production, including analytics datasets and reset-email callback addresses.
