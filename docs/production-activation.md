# Production account activation

Status: October 14, 2026. Brandon authorized public accounts and cloud saves and selected the Cubing Comp Sim organization for production.

## Provisioned

- Supabase project `mrxbjdkhtnojgoskhrfx`, named Cubing Comp Sim Production, in us-east-1 on the Free plan, separate from staging.
- Private `ccs_backend` schema with the same three backend tables as staging. Row-level security is enabled; anon/authenticated have no schema or table privileges.
- Dedicated `ccs_api_production` login with required DML access, no schema CREATE, superuser, role/database creation or RLS-bypass permission. Its credential is stored in the private production directory on the existing API host.
- Production Auth uses Resend SMTP at the verified auth.cubingcompsim.com sender, requires confirmation and a 12-character minimum password, and allows exact production signup/recovery redirects. Signup remains disabled until acceptance completes. Google and WCA remain disabled in the production manifest.
- Private R2 bucket `cubing-comp-sim-saves-production` was created with an Eastern North America location hint. Public access is disabled. No production storage write credential is configured.
- Production runtime configuration is prepared under `/home/brandon/ccs-production/private`; no secrets are committed. Its server.env and database.env permissions were verified as 600.
- Supabase security advisors returned no findings after the schema bootstrap. This does not establish live API, SMTP delivery or cloud-save acceptance.

## Release preparation

PR #15 passed web, API and dependency checks and was merged. It makes the account dialog fit its content, removes the optional-account sentence, and adds production frontend deployment from successful main web evidence. Domain activation verifies the target Worker first and restores the previous mapping if attachment fails. Local verification covered 216 application tests, typecheck, the verified-engine build, account browser regressions, three viewport sizes and five domain activation/rollback cases.

The production workflow remains inactive while `CCS_PRODUCTION_SUPABASE_PUBLISHABLE_KEY` is absent. Do not configure that variable before the API and acceptance checks are ready. A populated manifest does not itself deploy an API or enable signup.

## Remaining activation

1. Replace staging's Object Read only R2 token with Object Read & Write scoped to its staging bucket. Create a separate production token scoped to the production bucket. Limit use to the API host where practical. Store values only in the matching private server.env. The prepared browser token creation requires action-time confirmation under the computer-use policy.
2. Verify production restricted-role login from the API container with hostname/certificate-verified TLS. A container check was launched, but its result was not captured after the local automation connection closed; do not treat it as passed.
3. Activate the accepted API image, HTTPS, daily orphan cleanup and five-minute account-deletion retries. The current source has no production API installer. Do not run both staging and production proxy templates on the same host: both bind ports 80/443. Use a reviewed shared gateway or separate production host.
4. Verify live database/Auth/R2 round trips, account isolation, explicit upload/download replacement, retries/conflicts, deletion and restore. Use only disposable controlled accounts for synthetic acceptance.
5. Verify production signup confirmation and cross-browser password recovery through a real inbox. Complete separate production Google/WCA registration and human consent if those providers are to launch.
6. Configure the production public-key Actions variable, deploy the verified frontend to its separate Worker, activate the canonical hostname, verify the public account controls and cloud operations, then enable signup after acceptance.

The public domain still serves the guest build until promotion succeeds. Do not describe accounts/cloud saves as ready based on provisioning alone.
