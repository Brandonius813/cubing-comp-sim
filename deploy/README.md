# Environment deployment

The staging target is `https://staging.cubingcompsim.com`, with API `https://api-staging.cubingcompsim.com`. A prepared configuration or passing build is not proof that either is deployed or that cloud saves work.

On October 11, the independent staging frontend was deployed and its HTTPS hostname verified at source `60838e3b9142c27279e6493796b108705af12078`. Real browser password sign-in passed for two disposable confirmed accounts; sign-in and sign-out preserved local solve history. Both identities were removed afterward. This check did not exercise signup email delivery, recovery, or cloud transfers. The API remains pending the storage permission fix and administrator installation.

## Frontend

`Deploy isolated staging frontend` reuses the engine from a successful `Desktop web checks` artifact, verifies its checksum/conformance proof and unchanged engine source, and rebuilds only the UI with staging public settings. Unit checks and Chromium smoke checks run before publication. Build, publication and hostname activation are separate jobs, so failed activation can be retried without rebuilding the proven assets. The existing `morning-base-55f2` guest deployment remains separate. The staging hostname is reassigned to `ccs-staging-frontend`; its browser origin and IndexedDB name stay the same, so hosting changes do not clear local history.

Public settings live in `environments/staging.json` and the `CCS_STAGING_SUPABASE_PUBLISHABLE_KEY` Actions variable. The existing `CLOUDFLARE_API_TOKEN` secret and account variable authorize publication. Custom-domain activation also requires the zone permissions Cloudflare enforces; an authorization failure is reported without exposing the token. After setup, dispatch the workflow with a successful evidence run ID. Evidence expires, so archive verified releases for long-term promotion/rollback.

Backend administrator keys, database passwords and R2 keys never enter a frontend job or artifact.

## API artifact and environment rendering

`Cloud API checks` builds and tests an API image, then packages and reloads it to verify image identity as `api-release-<commit>` with a checksum and source SHA. Download that same image for staging and, after acceptance, production. Verify `SHA256SUMS` before loading it with Docker. Promote the image without rebuilding it against another moving base-image tag.

Render each environment's API/HTTPS configuration with:

```sh
node deploy/render-api.mjs deploy/environments/staging.json ccs-api:SOURCE_SHA SOURCE_SHA prepared-staging
```

This writes Compose, Caddy, environment and release files; it does not create resources or start services. Install them under `/etc/<serviceName>` owned by root. Store that environment's complete `server.env` and certificate under its owner-only private directory. The API image runs as UID/GID 1000, and its certificate file must be readable by that user. Compose reads credentials using `env_file` `format: raw`, preserving literal password characters. API ports remain private, and only the fixed HTTPS proxy address is trusted.

Before activation, run `node deploy/validate-secrets.mjs ENVIRONMENT_JSON PRIVATE_SERVER_ENV` on the host. It checks that the URLs, bucket, runtime role/project, origin and verified TLS settings match the selected environment without displaying credentials. Actual provider access must still pass live checks.

Use the same checked-in migrations for both environments. Create the private schema and restricted runtime role separately for each database. The one-time migration job uses an administrator connection with `MIGRATION_SCHEMA=ccs_backend`; the API uses its restricted connection. Remove the temporary administrator configuration after migration succeeds.

The currently prepared staging installer activates HTTPS, reboot recovery, daily orphan cleanup and account-deletion retries every five minutes in one administrator operation. Its fixed control commands permit automated staging verification without general Docker access. Production installation and a full generic installer have not yet been validated.

## Verification and rollback

After installing a release, verify certificate trust, exact frontend CORS origin, actual database/Auth/R2 operations and browser sign-in/upload/download/logout using disposable controlled accounts. Check that sign-in preserves local history, transfers occur only after confirmation, replacements never merge, and a second account sees only its own save. Process `/health` alone is insufficient. Email confirmation/recovery through a real inbox and large-save/failure/restore acceptance remain separate launch checks.

`verify-cloud-browser.mjs` accepts a private fixture with `settings.mode` equal to `cloud` or `signin-only`. The latter permits checking actual deployed Auth independently of an unavailable API; its temporary identities require private server-side cleanup afterward. Never put fixtures or human credentials in source control. Auth-only success is not cloud-save acceptance.

Rollback uses the previous tested API image and frontend artifact, with the same environment resources and secret files. Keep migrations compatible with the previous image or restore into isolated recovery resources before changing schema destructively. Do not roll back databases by deleting current user data.

## Production prerequisites

`production.example.json` is a template, not a provisioned environment. Create a separate production Supabase project, restricted role and credentials, private R2 bucket, API host, frontend Worker, email redirects and monitoring/backup resources. Fill and validate the production manifest; do not reuse staging identities or secrets. Reuse the accepted API image, migrations, proven engine and configuration renderer. Rebuild the UI with production public settings and run the real production smoke checks before opening signup. No production resources are created by the staging workflow.
