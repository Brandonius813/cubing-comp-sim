BEGIN;
CREATE TABLE IF NOT EXISTS cloud_saves (
  user_id uuid PRIMARY KEY,
  revision integer NOT NULL CHECK (revision > 0),
  object_key text NOT NULL UNIQUE,
  saved_at timestamptz NOT NULL DEFAULT now(),
  round_count integer NOT NULL CHECK (round_count >= 0),
  attempt_count integer NOT NULL CHECK (attempt_count >= 0),
  bytes integer NOT NULL CHECK (bytes > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$')
);
CREATE TABLE IF NOT EXISTS cloud_upload_receipts (
  user_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  expected_revision integer NOT NULL CHECK (expected_revision >= 0),
  sha256 text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, operation_id)
);
CREATE INDEX IF NOT EXISTS cloud_upload_receipts_created ON cloud_upload_receipts(created_at);
-- Backend-only tables. No browser grants or public/anonymous access.
ALTER TABLE cloud_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_upload_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cloud_saves, cloud_upload_receipts FROM PUBLIC;
COMMIT;
