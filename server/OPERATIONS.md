# Cloud API activation

The guest website works without this server. Cloud operations are disabled until a real Supabase project, PostgreSQL database, private S3-compatible bucket, and server are configured. No production service or email sender has been provisioned.

## Run and verify

From `server/`, run `npm install`, `npm run build`, and `npm test`. Commit the generated package lock once installation has succeeded. Copy `.env.example` to an ignored `.env` and supply real values through your local secret store or hosting environment, never source control. Run `npm run migrate` once with a database role allowed to create the backend tables, then `npm run dev`. Production starts with `npm start` after building. The Docker build uses the application root as context: `docker build -f server/Dockerfile -t ccs-api .`.

Supabase must require email confirmation and use production SMTP before signup is enabled. Configure an exact site URL and allowlisted confirmation/recovery redirects for each environment. Browser public settings are `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL`, and `VITE_APP_URL`. No browser service-role key is needed. The API uses the public key to verify signed tokens and current user records with Supabase.

The database and bucket must have separate development, staging, and production resources. Keep the bucket private and restrict its key to this bucket. The API uses parameterized queries and server-derived account IDs. Use a dedicated backend database role. If running inside a Supabase database, do not grant these tables to `anon` or `authenticated`; the table owner/backend role executes queries. Remote database TLS verifies certificates. Remove SSL URL parameters and configure `DATABASE_TLS` and, when necessary, `DATABASE_CA_FILE` explicitly.

## Save behavior

`GET /v1/save/metadata` returns the current save or `null`. `PUT /v1/save` takes the shared versioned history JSON, an `If-Match` header containing the reviewed revision (`"0"` for no save), and a UUID `Idempotency-Key`. `GET /v1/save` returns the current history and metadata. There are no merge, automatic upload, or automatic download endpoints. Account IDs in bodies are ignored.

The backend validates history, compresses it, writes a unique object, then atomically replaces the one current database pointer. PostgreSQL serializes replacements per account, including initial uploads. A stale revision returns 409; the client must review the new state before deliberately replacing it. An identical request using the same operation ID returns its original result for seven days. Receipts contain metadata, not extra histories. Retries must preserve the exact snapshot, including its export timestamp.

Previous objects are deleted after commit. Failed or interrupted operations may leave temporary objects; run `npm run cleanup` daily (production bundle: `node dist/cleanup.js`). The sweep deletes unreferenced objects older than 24 hours and expired retry receipts. It never deletes the current object. There is one user-facing save, with no history of ten complete saves. Service/database backups are a separate disaster-recovery concern and must be configured together for objects and metadata.

The initial uncompressed save limit is 100 MiB, matching local import validation. The API caps concurrent uploads at two per process and rate-limits requests. One API instance is enough initially. Multiple instances require a shared rate limiter and measured memory/load limits. Set the hosting request limit to at least the API body limit and terminate HTTPS at the hosting gateway. Proxy trust is off by default; configure an explicit trusted proxy policy before depending on per-client-IP rate limits behind a proxy.

## Required release checks

- Run the backend unit/API tests. These use explicit test doubles; they do not prove a deployed provider integration.
- Run real two-account tests against staging Supabase: expired, wrong-project, tampered, revoked and unverified tokens; account A cannot read or replace account B's save.
- Exercise two simultaneous PostgreSQL uploads at the same revision. Exactly one must commit. Kill the process before/after object write and around database commit, then retry the same operation ID.
- Exercise a real R2 upload/download, failed object write, unavailable database, checksum corruption, cleanup, and concurrent upload/download.
- Test verification and password recovery through real SMTP, including recovery in a different browser, expiry, repeated links, and signing out other sessions.
- Inspect logs and HTTP error bodies for passwords, emails, tokens, histories and query strings. None should be present.
- Configure account deletion and connected identity cleanup before public account signup. This backend does not yet expose a self-service account deletion endpoint.
- Configure TLS, independent backups and a restore drill, log retention, uptime/5xx/spending alerts, provider rate limits, and abuse controls before public launch.

`/health` checks the process only. It is not proof that the identity service, database or bucket is healthy. Logs use stable codes, route templates and request IDs. Preserve the request ID when reporting a failed cloud operation; do not request users' passwords or access tokens.
