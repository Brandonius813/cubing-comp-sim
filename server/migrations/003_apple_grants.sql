BEGIN;
CREATE TABLE IF NOT EXISTS apple_grants (
  user_id uuid NOT NULL,
  client_id text NOT NULL,
  encrypted_grant text NOT NULL,
  PRIMARY KEY(user_id, client_id)
);
ALTER TABLE apple_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON apple_grants FROM PUBLIC;
ALTER TABLE account_deletions ADD COLUMN IF NOT EXISTS apple_revocation_required boolean NOT NULL DEFAULT false;
COMMIT;
