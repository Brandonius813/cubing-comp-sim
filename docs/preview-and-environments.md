# Preview and environment setup

Updated October 9, 2026. These are setup instructions, not claims that accounts or hosted deployments already exist.

## Preview before buying or configuring a backend

The guest website does not need Supabase, R2, an API server, or email. GitHub Actions already builds a complete browser app and uploads it in the `desktop-web-evidence` artifact.

1. Open the repository's Actions tab and select a **successful Desktop web checks** run for the current pull-request commit.
2. Download `desktop-web-evidence` and unzip it.
3. Open Terminal in the extracted directory containing `dist/`.
4. With Python 3 installed, run `python3 -m http.server 4173 --bind 127.0.0.1 --directory dist`.
5. Open `http://localhost:4173`. Keep Terminal open. Press Control-C to stop.

Serve the prebuilt `dist` folder, not the source directory. Opening `index.html` with a file URL will not exercise workers and offline caching properly. The built artifact already includes the TNoodle engine, so previewing it does not require Java or Maven. Artifacts expire after seven days under the current workflow; use the newest successful run.

For local development from source, use the repository's Node/Java/Maven instructions. `build:ui` alone is not proof that an offline scramble engine exists. The production build and CI assert the engine files and source provenance.

## Three environments

| Environment | Purpose | Data |
|---|---|---|
| Localhost | Developer iteration and private UI review | Browser-local history; optional local test backend |
| Staging | Stable hosted version for real browser, email, cloud-save and device tests | Dedicated test auth project, database and private save bucket |
| Production | Public version at cubingcompsim.com | Dedicated production accounts, database and private save bucket |

Start with a hosted guest preview. Add staging backend resources only when testing accounts and upload/download. Add production resources when staging passes acceptance.

Browser storage belongs to the origin. Localhost, a Pages preview URL, and cubingcompsim.com have separate local histories. Use Export/Import or explicit cloud upload/download to move times. Do not promise that a preview's local times will appear automatically on the production domain.

## Recommended hosted preview path

Create a Cloudflare account and a **Pages Direct Upload** project with `main` as the production branch. Build and test in GitHub Actions, then deploy its verified `dist` with Wrangler using a staging branch. The existing Java/Maven TNoodle compilation stays in the CI environment that already runs it.

The future deployment command is `wrangler pages deploy dist --project-name=<project> --branch=staging`. This is documentation, not a command to publish an unreviewed build. Cloudflare supplies a stable branch alias such as `staging.<project>.pages.dev` and a deployment-specific URL. This example is not a live link.

Direct Upload can be automated from GitHub Actions. It is a different project mode from Cloudflare-managed Git builds; Cloudflare does not support simply converting the project between the two modes later. Decide this once during setup.

Create a token scoped to the chosen Cloudflare account with **Cloudflare Pages: Edit**. Store `CLOUDFLARE_API_TOKEN` in GitHub Actions secrets, never in source or chat. Store the account ID and project name as deployment configuration. Configure the deployment workflow after the account/project exist. Keep production promotion explicit and protected; preview deployment does not require changing Namecheap DNS.

Preview URLs are public by default. Cloudflare Access can restrict them while the app/license is being reviewed. A preview is separate from the production custom domain.

## Provider roles and account order

| Service | Technical role | App responsibility |
|---|---|---|
| Namecheap | Domain registrar | Keep registration, renewal and ownership of cubingcompsim.com |
| Cloudflare DNS | Authoritative DNS | Map website, API, audio and email verification names to their services |
| Cloudflare Pages | Static hosting and CDN | Deliver the web UI, scripts, fonts and compiled offline scramble engine |
| Cloudflare R2 | Object storage | Private compressed cloud-save files; a separate public bucket for licensed ambience |
| Supabase Auth | Managed identity service | Email/password login, sessions, verification, recovery and account administration |
| Supabase Postgres | Managed relational database | Save ownership, current version, checksum and object pointer |
| DigitalOcean Droplet | Linux virtual server | Run the existing Fastify API container and scheduled maintenance |
| Resend | Transactional email provider | Deliver verification and password-reset email through Supabase SMTP |
| PostHog | Product analytics | Consented app activity, retention and feature-use dashboards |
| Sentry | Error reporting | Group failures, attach release information and notify the operator |
| GitHub Actions | Build/test/deployment automation | Reproduce the engine build, run checks and promote a verified artifact |

Supabase removes the need to implement password storage or recovery-token cryptography. The custom API still provides a useful backend learning project: authorization, upload validation, concurrency, private storage, database migrations, tests, logs, deployment and backups. Moving that API to managed container hosting is a future operational choice, not a reason to rewrite browser logic.

Resend is not a human inbox such as Gmail. Use a working support/reply address separately. Configure custom SMTP before public signup; Supabase's built-in mail sender is for limited testing.

## Ordered setup checklist

1. Create Cloudflare, enable MFA, and create the guest-preview Pages project. Configure the scoped deployment credential in GitHub Actions. Do not transfer domain registration.
2. Deploy one verified guest preview after the owner approves public exposure and license status. Test it before paying for the rest of the stack.
3. When ready for branded staging/email, add cubingcompsim.com to Cloudflare DNS. Copy all current records, especially MX/TXT email records, before replacing Namecheap nameservers with Cloudflare's assigned pair. Registration remains at Namecheap.
4. Create a Supabase **staging** project. Choose a region near the API host. Apply reviewed database migrations; configure email/password auth, exact redirect URLs and recovery behavior. Frontend gets only public URL/client key; server secrets stay private.
5. Enable R2 and create a private staging save bucket. Give the API bucket-scoped credentials. Never expose this bucket publicly. Create a separate public audio bucket only after recordings are selected.
6. Create Resend and verify a sending domain via the provided DNS records. Enter its SMTP credentials in Supabase. Test verification, recovery, expired links, reused links and rate limits with real inboxes.
7. Create DigitalOcean and a staging Linux Droplet. Provision SSH keys, firewall, Docker, HTTPS, runtime secrets, log rotation and the documented cleanup job. Deploy the existing server container. No scrambles are generated on this server.
8. Connect the frontend to staging. Test two accounts and two devices, unauthorized access, interrupted uploads, stale overwrite conflicts, account deletion, offline errors and a backup restore.
9. Create separate staging PostHog and Sentry projects. Configure consent, redaction, retention and alerts. Count authoritative accounts from Auth; DAU/MAU from consenting analytics users are not a complete population count.
10. Resolve the application license, review translations, acquire reviewed voice/background recordings, and complete real-device performance/audio checks.
11. Create isolated production resources and secrets, attach the custom domain, configure production redirects/email, and test recovery/restore before launch. Promote only the verified build.
12. Defer Apple and Google Play developer accounts until the web release is stable and native packaging work begins.

Do not create every paid service at once. Use staging first, set budgets, and review each provider's current pricing before enabling a paid plan. A VPS is inexpensive but the owner must maintain OS updates, security, process restarts, backups and monitoring. Managed hosting trades some of that work for higher service fees.

## Sources

- [Cloudflare Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Direct Upload from CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)
- [Preview deployments and access](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
- [Namecheap nameserver changes](https://www.namecheap.com/support/knowledgebase/article.aspx/767/10/how-to-change-dns-for-a-domain/)
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Resend with Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp)
- [Cloudflare public R2 buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)
