# Cloud API activation

The guest website works without this server. Cloud operations are disabled until a real Supabase project, PostgreSQL database, private S3-compatible bucket, and server are configured. No production service or email sender has been provisioned.

## Run and verify

From `server/`, run `npm install`, `npm run build`, and `npm test`. Commit the generated package lock once installation has succeeded. Copy `.env.example` to an ignored `.env` and supply real values through your local secret store or hosting environment, never source control. Run `npm run migrate` once with a database role allowed to create the backend tables, then `npm run dev`. Production starts with `npm start` after building. The Docker build uses the application root as context: `docker build -f server/Dockerfile -t ccs-api .`.

Supabase must require email confirmation and use production SMTP before signup is enabled. Configure an exact site URL and allowlisted confirmation/recovery redirects for each environment. Browser public settings are `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL`, and `VITE_APP_URL`. No browser service-role key is needed. The API uses the public key to verify signed tokens and current user records with Supabase.

The database and bucket must have separate development, staging, and production resources. Keep the bucket private and restrict its key to this bucket. The API uses parameterized queries and server-derived account IDs. Use a dedicated backend database role. If running inside a Supabase database, do not grant these tables to `anon` or `authenticated`; the table owner/backend role executes queries. Remote database TLS verifies certificates. Remove SSL URL parameters and configure `DATABASE_TLS` and, when necessary, `DATABASE_CA_FILE` explicitly. Run all migrations, including `002_account_deletion.sql`, before starting the updated API.

## Save behavior

`GET /v1/save/metadata` returns the current save or `null`. `PUT /v1/save` takes the shared versioned history JSON, an `If-Match` header containing the reviewed revision (`"0"` for no save), and a UUID `Idempotency-Key`. `GET /v1/save` returns the current history and metadata. There are no merge, automatic upload, or automatic download endpoints. Account IDs in bodies are ignored.

The backend validates history, compresses it, writes a unique object, then atomically replaces the one current database pointer. PostgreSQL serializes replacements per account, including initial uploads. A stale revision returns 409; the client must review the new state before deliberately replacing it. An identical request using the same operation ID returns its original result for seven days. Receipts contain metadata, not extra histories. Retries must preserve the exact snapshot, including its export timestamp.

Previous objects are deleted after commit. Failed or interrupted operations may leave temporary objects; run `npm run cleanup` daily (production bundle: `node dist/cleanup.js`). The sweep deletes unreferenced objects older than 24 hours and expired retry receipts. It never deletes the current object. There is one user-facing save, with no history of ten complete saves. Service/database backups are a separate disaster-recovery concern and must be configured together for objects and metadata.

The initial uncompressed save limit is 100 MiB, matching local import validation. The API caps concurrent uploads at two per process and rate-limits requests. One API instance is enough initially. Multiple instances require a shared rate limiter and measured memory/load limits. Set the hosting request limit to at least the API body limit and terminate HTTPS at the hosting gateway. Proxy trust is off by default; configure an explicit trusted proxy policy before depending on per-client-IP rate limits behind a proxy.

## Account deletion

`DELETE /v1/account` requires a verified Supabase session, an explicit `DELETE_ACCOUNT` confirmation, and password authentication within the previous five minutes. The browser asks for the account email as confirmation and the current password, then signs in with Supabase again. It sends the resulting access token to our API. The password never goes to the cloud-save API. The API uses the signed `amr` password timestamp; a newly refreshed token or account-recovery link is not sufficient. An unverified-email account can still delete itself after password authentication. The API derives the target solely from the authenticated user, ignoring any supplied user ID.

Configure `SUPABASE_SERVICE_ROLE_KEY` only in the server secret store to enable identity deletion. Normal cloud requests continue to use the public verification client; a separate server admin client performs hard identity deletion. Never put this key in a `VITE_` variable, browser environment, logs, or source control. Without it, the deletion endpoint returns an explicit unavailable response without creating a deletion request. Account deletion must be configured and tested before public signup.

Before external deletion begins, PostgreSQL records a durable request under the same per-account lock used by cloud uploads. The account is then blocked from cloud reads and writes. In-flight uploads cannot commit after the deletion marker. The server deletes the Supabase identity, atomically detaches its save/receipt metadata while preserving the object pointer in the cleanup job, deletes the current cloud object, then completes the job. Existing JWTs are also checked against the current Supabase user and the deletion marker; a signature alone does not restore access.

A response of `deleted` means the identity, current cloud save and save metadata were removed. A response of `pending` means the request was recorded and access blocked, with cleanup still required. The browser signs out for either result while preserving every local time and setting. A retry after interrupted identity/object deletion is safe. Temporary uncommitted objects from interrupted uploads are removed by the existing orphan sweep. Completed jobs retain only the account ID and deletion timestamps for seven days, then are pruned. Independently managed disaster-recovery backups expire according to their configured retention and are not claimed to disappear immediately.

Schedule `npm run cleanup:accounts` every five minutes, or `node dist/cleanup.js --accounts-only` in production, and alert on a nonzero exit. It retries up to 100 pending accounts per run. Monitor backlog and increase frequency/capacity if needed. Keep the daily full `cleanup` job for old orphan objects and receipts. If an admin key is removed while pending jobs exist, cleanup fails visibly instead of silently abandoning them. Run the deletion two-account and failure/retry cases against staging before enabling public accounts.

Primary references: [Supabase deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser), [JWT AMR fields](https://supabase.com/docs/guides/auth/jwt-fields), [user deletion and token behavior](https://supabase.com/docs/guides/auth/managing-user-data).

## Required release checks

- Run the backend unit/API tests. These use explicit test doubles; they do not prove a deployed provider integration.
- Run real two-account tests against staging Supabase: expired, wrong-project, tampered, revoked and unverified tokens; account A cannot read or replace account B's save.
- Exercise two simultaneous PostgreSQL uploads at the same revision. Exactly one must commit. Kill the process before/after object write and around database commit, then retry the same operation ID.
- Exercise a real R2 upload/download, failed object write, unavailable database, checksum corruption, cleanup, and concurrent upload/download.
- Test verification and password recovery through real SMTP, including recovery in a different browser, expiry, repeated links, and signing out other sessions.
- Inspect logs and HTTP error bodies for passwords, emails, tokens, histories and query strings. None should be present.
- Test self-service deletion with two accounts and provider/object failures, retries, stale/refreshed JWTs, and a simultaneous upload. Confirm deleting one account preserves the other account and all local history. Confirm the cleanup schedule is active before public account signup.
- Configure TLS, independent backups and a restore drill, log retention, uptime/5xx/spending alerts, provider rate limits, and abuse controls before public launch.

`/health` checks the process only. It is not proof that the identity service, database or bucket is healthy. Logs use stable codes, route templates and request IDs. Preserve the request ID when reporting a failed cloud operation; do not request users' passwords or access tokens.
