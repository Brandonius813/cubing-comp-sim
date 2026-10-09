BEGIN;
CREATE TABLE IF NOT EXISTS account_deletions (
  user_id uuid PRIMARY KEY,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  object_key text
);
ALTER TABLE account_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_deletions FROM PUBLIC;
COMMIT;
