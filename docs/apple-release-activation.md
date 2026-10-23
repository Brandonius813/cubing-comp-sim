# Apple backend release candidate, October 23, 2026

Status: backend activated after owner approval on October 23. Migration 003 is applied with runtime ownership and RLS enabled. The API is healthy, runtime grant read/write passed inside a rolled-back transaction, the upgraded account cleanup completed with zero pending accounts, and both cleanup timers are active. Public health returned 200 and unauthenticated Apple grant submission returned 401. No real Apple consent/revocation or App Store submission is claimed.

The host's containerd image ID is the archive's OCI manifest digest `sha256:f61209e2adc68e05a3287b024c10c948f0259945ab375d88b7d44fdfc3be8b45`; CI's Docker image ID below is its config digest. Both were verified against the same checksum-verified archive.

The owner requested device testing before App Store Connect setup. Apple is enabled only in the internal EAS preview configuration for acceptance testing. Public website Apple gating remains closed. Mobile typecheck and all 114 tests passed again. Native build status will be recorded after EAS returns a result.

## Verified starting state

- Local implementation: `c04019d162eb04dda8479fb84405f3830e43a1d6`, initially clean on `feat/mobile-minimal-ui`.
- PR #53 was already merged into `feat/ios-review-ready` at `cb1d340741d5a2af1b53d576756c26d932e1be89`. It was not merged by this preparation.
- Website deployment marker: `d17fa698c3de7f94fcb1d5675d80c2bceedd24d6`, providers Google/WCA.
- Production and staging API images: `eb1916b9bfea4c2479436d7e10bec33bd28a570c`; production health returned HTTP 200.
- Apple provider enabled with web Services ID first, native bundle ID second. The management response did not expose a nonce-check field; this preparation did not change nonce configuration.

## Concrete backend candidate

CI run [39979002752](https://github.com/Brandonius813/cubing-comp-sim/actions/runs/39979002752) passed 34 API tests, including real PostgreSQL tests with no skips, and three backup tests. Its artifact uses GitHub's PR merge SHA `4070c38cabef6cb06115e9605fabd195f0352cb7`; GitHub comparison returned no changed files relative to implementation commit `c04019d`.

- Image: `ccs-api:4070c38cabef6cb06115e9605fabd195f0352cb7`
- Image ID: `sha256:e88532021227f7e285a35ee174ad44bf532af596d0292eb6839ec3d6003066ad`
- Archive SHA-256: `0df85a656eb510add400cb2eb1bc770dd11b0a817e5c7155d337d30c327d54ad`

The archive checksum passed locally and on the existing API host. The image was loaded into Docker without replacing a running service. Candidate configuration is staged in the host's private release directory. Apple configuration was generated as the existing environment owner using the tested container, because the host has no standalone Node executable. Candidate environment mode is 600. The temporary standalone signing-key copy was removed after configuration.

Preflight established:

- Verified TLS connection as `ccs_api_production`, default schema `ccs_backend`.
- Valid 32-byte encryption key configuration.
- Both Apple client IDs returned `invalid_grant` for a deliberately invalid authorization code using signed client credentials. This is a credential/configuration probe, not consent, code exchange, grant capture, or revocation acceptance.
- An isolated candidate container with no published ports returned HTTP 200 for `/health` and HTTP 401 for unauthenticated `POST /v1/account/apple-grant`. The test container was removed.
- Installer fixture regression passed again.

## Migration and coordinated activation

The existing production tables are owned by `postgres`, with explicit `ccs_api_access` policies for `ccs_api_production`. Runtime membership granted to the administrator has SET disabled, and the runtime lacks schema CREATE permission. Consequently, a plain ownership transfer fails.

The prepared transaction applies migration 003 with an explicit private search path. Within the same transaction it temporarily allows the administrator to SET the runtime role and temporarily grants schema CREATE for the ownership transfer. It assigns `apple_grants` to `ccs_api_production`, then restores both original restrictions before commit. RLS remains enabled and no public access is added. A rollback-only execution successfully inserted and selected a synthetic row as the runtime role; subsequent checks confirmed that the table did not remain and schema CREATE remained denied.

Activation requires the owner's production approval. Execute in this order:

1. Stop both production cleanup timers and wait for existing cleanup services/containers to finish. Keep public Apple controls closed.
2. Apply the prepared transaction. Verify private schema, table owner, RLS, durable deletion column and restored role restrictions.
3. Back up existing private configuration; install the prepared candidate environment atomically with owner/mode retained.
4. Install the candidate Compose file. Its only changes are the API/cleanup image and release SHA; proxy image, network aliases, volumes and routing remain unchanged.
5. Recreate only the API using `up -d --no-deps api`. Verify actual container image identity, health, configured clients and runtime table access.
6. Verify cleanup uses the same image/configuration, then restart both timers. Do not leave an old cleanup worker handling Apple-linked deletions.
7. Exercise controlled real Apple consent, capture and deletion with owner participation before opening the public web provider gate.

On failure after activation, keep Apple controls closed and maintenance stopped until the failure is assessed. Do not blindly restore the old cleanup image after Apple grants or durable revocation requirements exist. Keep the new encryption key with private recovery material.

## Native and submission status

Expo's authenticated usage query reported the Free plan, 3 of 30 aggregate builds used, no overage metrics and total cost 0. Recheck platform allowance and pending builds immediately before starting a preview. No build was started here. Refresh/check Apple provisioning entitlement rather than freezing old credentials.

Two CI failures remain concrete release work:

- Mobile run `39979002602`: production bridge generation timed out after 180 seconds on the first 4x4 scramble. Earlier 2x2 and 3x3 checks passed. Do not label this as full engine acceptance or merely increase the threshold without examining native behavior.
- Dependency run `39979002970`: root/mobile security audits failed. Resolve applicable advisories or document reviewed scope; no clean audit is claimed.

The existing store-preparation document also records unresolved TNoodle native-distribution licensing. App Store Connect app record, screenshot uploads, final privacy declarations and distribution signing have not been verified. Owner requested no browser/computer control during this work; use APIs/CLI or request the specific missing owner action. No App Store-compatible license clearance, tested distribution binary, or submission readiness is claimed.
