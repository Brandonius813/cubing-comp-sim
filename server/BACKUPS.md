# Cloud-save backup operations

`backup.mjs` is a bounded operator tool for the first deployment. It reads the production backend tables and current R2 save objects, verifies each object's decompressed checksum and counts, and encrypts both objects and metadata with AES-256-GCM. It never writes a production table or changes an account. No credentials belong in source control, shell command arguments, or logs.

This is a **cloud-save data backup**, not a complete Supabase project or Auth backup. It does not contain account passwords, OAuth configuration, private environment files, or database roles. Recovering a lost Supabase project still requires a separately verified database/Auth backup and private configuration recovery. Supabase recommends offsite database exports for Free projects. Its managed database backups do not cover separately stored objects. See [Supabase backups](https://supabase.com/docs/guides/platform/backups).

## Consistency and limits

- The backup briefly locks `account_deletions`, `cloud_saves`, and `cloud_upload_receipts` against writes before reading a repeatable snapshot. This keeps replacements and deletion from removing an object while it is copied. Readers continue normally.
- Failure to obtain the locks within five seconds fails the backup without changes. This initial tool is capped at 1,000 saves, 100 MiB of total uncompressed history, 10,000 receipts, and roughly one minute of copying. Abort and improve the implementation if these caps are reached; do not remove the limits for a growing service.
- Accounts already marked for deletion are excluded. Deletion records are kept inside the encrypted manifest. Restore exports are isolated and are never automatically loaded into production. A later production restore must check **current** Auth users/deletion records, including deletions after the backup, so it cannot resurrect a deleted account.
- An incomplete capture has a `.partial` suffix and is removed on handled failure. Only the completed directory is a backup. Existing destinations and keys are never overwritten.

## Capture and isolated restore drill

Use the existing tested API image and its private environment, network, and CA certificate. The standalone script can be mounted at `/app/backup.mjs`; it resolves `pg` and the S3 SDK from the image's installed dependencies. Mount a dedicated operator-only directory at `/backup`, owned by the container UID 1000 and mode 0700. Never put backups in the runtime saves bucket or a public artifact directory.

Run these commands inside that configured one-shot container. The example name is an operator-selected unique timestamp, not a reusable output directory:

```sh
node /app/backup.mjs keygen /backup/recovery.key
node /app/backup.mjs backup /backup/recovery.key /backup/2026-10-14T000000Z
node /app/backup.mjs drill /backup/recovery.key /backup/2026-10-14T000000Z /backup/restore-2026-10-14T000000Z
```

Run `keygen` only once. Keep a separate recovery copy of the 32-byte key in the owner's password manager or equivalent approved private store, away from the API host and backup bucket. Losing the key makes backups unreadable. Key files must have mode 0600. Never print the key, include it in a PR, or upload it with the archive.

The drill decrypts into a **new private directory**, loads metadata into a connection-private PostgreSQL TEMP table, reads every restored compressed object against that metadata, and rolls back the temporary table. It reports only counts. It does not overwrite production data, create Auth identities, or prove recovery of the complete Supabase project. The output directory contains plaintext history; remove that exact drill directory after inspection. A meaningful live drill needs at least one nonempty disposable test save. A zero-save success verifies connections and encryption only.

For an offline export without database access:

```sh
node server/backup.mjs restore PRIVATE_KEY ENCRYPTED_DIRECTORY NEW_PRIVATE_DIRECTORY
```

Import/read the restored JSON using the current app's snapshot validator before a real recovery. Keep the archive immutable; restore into new locations first. Do not run the account-cleanup scheduler against restored metadata until current deletion records and identities have been reconciled.

## Remaining offsite setup

A local encrypted capture is not protection against losing the API host. Finish these steps before calling disaster recovery ready:

1. In Cloudflare R2, create **cubing-comp-sim-backups-production**. Keep public access and custom public domains disabled.
2. Create a separate R2 token named **ccs-production-backups**, with **Object Read & Write** on only that backup bucket and the API server IP `143.198.117.197`. Do not broaden the runtime saves token. Store the new access key ID and secret in the private operator secret store.
3. Configure a lifecycle rule for objects under `backups/` to expire after seven days. Keep retained local capture directories to the same seven-day window. Keep the encryption recovery key separately for as long as any archive uses it.
4. Configure a daily operator job to capture a unique timestamp directory, upload **only the encrypted `.ccsbk` files** under `backups/TIMESTAMP/`, and upload `manifest.ccsbk` last. Verify uploaded bytes by reading them back before marking success. Preserve the preceding successful backup when any step fails. The runtime orphan cleanup must not have access to this backup bucket.
5. Download one completed offsite capture to a new private directory and run the isolated drill above, including a nonempty history. Alert the owner on a failed daily job or no successful capture for 26 hours. This schedule, read-back verification, and alert are not supplied or claimed active by this standalone script.
6. Separately establish encrypted offsite Supabase database/Auth exports and a new-project restore procedure. Restoring history alone does not restore login accounts. Confirm role passwords, SMTP, provider credentials, and deletion reconciliation from private operational records.

The seven-day recovery window is an operator retention choice aligned with the existing deletion record retention. There is no user-facing save history. Public privacy/support documentation must describe the actual retention once the backup schedule is enabled.

## Verification

`node --test server/backup.test.mjs` covers nonempty snapshot reconstruction, wrong-key and tamper rejection, deletion exclusions, checksum/count corruption, private output permissions, and refusal to overwrite an existing restore destination. CI runs this suite with API checks. These tests do not claim that production capture, offsite storage, scheduling, email delivery, or an Auth restore has succeeded.
