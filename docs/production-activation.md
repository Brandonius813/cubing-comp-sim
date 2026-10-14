# Production account activation

Status: October 14, 2026. Brandon authorized public accounts and cloud saves in the Cubing Comp Sim organization. The production frontend and API are deployed. Signup is enabled with email confirmation required, but public account onboarding is blocked by SMTP authentication until the provider credential is corrected and real email delivery passes.

## Live resources and verification

- Separate Supabase production project `mrxbjdkhtnojgoskhrfx`, named Cubing Comp Sim Production, in us-east-1 on the Free plan.
- Private `ccs_backend` schema with the same three backend tables as staging. RLS is enabled; anon/authenticated have no schema or table privileges. Dedicated `ccs_api_production` has required DML access without schema CREATE, superuser, role/database creation or RLS-bypass permissions. Restricted-role access with certificate/hostname-verified TLS passed from the API environment.
- Separate private production R2 bucket `cubing-comp-sim-saves-production` with public access disabled. Staging and production each have working bucket-scoped runtime write credentials. Real upload/download/delete provider checks passed for both environments.
- API image `eb1916b9bfea4c2479436d7e10bec33bd28a570c` is installed for both environments. Its API/auth/cloud code matches frontend source `f7f166327bff0865f7f0f26cbbdab3d3e728deae`. Both HTTPS health endpoints return 200; unauthenticated save metadata returns 401. Production CORS permits its exact frontend origin.
- One Caddy gateway owned by production serves both API hostnames. Its explicit targets are production `172.28.54.3:3001` and staging `172.28.53.3:3001`. The staging Compose project has no proxy. Services, daily orphan cleanup and five-minute account-deletion retry timers are enabled. Shared-gateway systemd ordering is installed; see [deployment instructions](../deploy/README.md).
- Production public-key repository variable is configured. Production frontend workflow run [38595686402](https://github.com/Brandonius813/cubing-comp-sim/actions/runs/38595686402) published source `f7f166327bff0865f7f0f26cbbdab3d3e728deae` to the separate production Worker. The canonical app origin is `https://cubingcompsim.com`; `www` redirects to it.
- Disposable confirmed-account API acceptance passed upload/download, repeated-request idempotency, revision conflict handling, replacement, cross-account isolation and account deletion. This synthetic API test used an empty snapshot; it does not establish a real user's completed-round transfer or actual signup/recovery delivery. The disposable accounts were removed.
- Runtime secrets remain in environment-specific private directories, not source control. Production private configuration file permissions were verified as 600. Supabase security advisors returned no findings after schema bootstrap.

## Email blocker

Production Auth requires a confirmed email and a minimum 12-character password. Exact production signup and recovery redirects are configured. Resend SMTP uses `smtp.resend.com:465`, username `resend`, and sender `no-reply@auth.cubingcompsim.com`. The configured custom-SMTP send limit is 30 emails per hour.

An actual signup failed on October 14 at 16:22:09 UTC with SMTP `535 Authentication credentials invalid`. The owner is replacing the SMTP password in the production Supabase dashboard with an original Resend API key that has sending access. Treat a password returned by another project's auth-configuration read as unverified: it may be masked or hashed. Retrieve the original credential from its secure store or create an appropriate new provider key; never reuse a returned opaque value as proof of a working secret.

After replacement, a real user must receive the signup confirmation, follow the link, sign in and complete password recovery. A successful settings update or synthetic confirmed-account login does not prove delivery.

## Remaining acceptance

1. Resolve the SMTP authentication failure and verify signup confirmation and cross-browser password recovery through a real inbox.
2. Complete browser acceptance using a completed round: signing in preserves local history, the account dialog’s **Upload** action saves it, and **Download** on another browser/device replaces local history only after confirmation. These workflows are manual replacements, not background synchronization.
3. Record independent backup/restore acceptance and its operating procedure. Existing cleanup timers are not backups.
4. Complete separate production Google/WCA registration and actual human consent/linking acceptance before enabling either manifest gate. The production manifest currently has `authProviders: []`; email/password is the active account path once SMTP works.
5. Publish and verify the cache-update repair separately. Never instruct users to clear browser site data to pick up a release because that can delete their local history.

Do not describe the complete MVP account flow as ready until real email and cross-device acceptance are recorded. Resource provisioning and process health alone do not establish this.
