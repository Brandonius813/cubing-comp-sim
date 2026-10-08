import { Pool, type PoolClient } from 'pg';
import { ApiError } from './errors.js';
import { publicMetadata, type SaveMetadata, type SaveRepository, type StoredSave, type UploadReceipt } from './contracts.js';

function decode(row: Record<string, unknown>): StoredSave {
  return { revision: Number(row.revision), objectKey: String(row.object_key), savedAt: (row.saved_at instanceof Date ? row.saved_at : new Date(String(row.saved_at))).toISOString(), roundCount: Number(row.round_count), attemptCount: Number(row.attempt_count), bytes: Number(row.bytes), sha256: String(row.sha256) };
}

export class PostgresSaves implements SaveRepository {
  constructor(private readonly pool: Pool) {}
  async current(userId: string): Promise<StoredSave | null> {
    const result = await this.pool.query('SELECT * FROM cloud_saves WHERE user_id = $1', [userId]);
    return result.rows[0] ? decode(result.rows[0]) : null;
  }
  async receipt(userId: string, operationId: string): Promise<UploadReceipt | null> {
    const result = await this.pool.query('SELECT expected_revision, sha256, result FROM cloud_upload_receipts WHERE user_id=$1 AND operation_id=$2', [userId, operationId]);
    const row = result.rows[0];
    return row ? { expectedRevision: row.expected_revision, sha256: row.sha256, save: row.result as SaveMetadata } : null;
  }
  async replace(userId: string, expectedRevision: number, operationId: string, incoming: Omit<StoredSave, 'revision' | 'savedAt'>): Promise<{ save: SaveMetadata; previousKey: string | null; replay: boolean }> {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      // A per-account transaction lock also covers the first upload, where no
      // cloud_saves row exists to SELECT FOR UPDATE. Hash collisions only serialize.
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [userId]);
      const deletion = await db.query('SELECT 1 FROM account_deletions WHERE user_id=$1', [userId]);
      if (deletion.rows[0]) throw new ApiError(410, 'account_deleting');
      const receipts = await db.query('SELECT expected_revision, sha256, result FROM cloud_upload_receipts WHERE user_id=$1 AND operation_id=$2', [userId, operationId]);
      if (receipts.rows[0]) {
        const receipt = receipts.rows[0];
        if (receipt.sha256 !== incoming.sha256 || receipt.expected_revision !== expectedRevision) throw new ApiError(409, 'idempotency_conflict');
        await db.query('COMMIT');
        return { save: receipt.result as SaveMetadata, previousKey: null, replay: true };
      }
      const previousRows = await db.query('SELECT * FROM cloud_saves WHERE user_id=$1 FOR UPDATE', [userId]);
      const previous = previousRows.rows[0] ? decode(previousRows.rows[0]) : null;
      if ((previous?.revision ?? 0) !== expectedRevision) throw new ApiError(409, 'revision_conflict');
      const saved = await db.query(`INSERT INTO cloud_saves(user_id,revision,object_key,round_count,attempt_count,bytes,sha256)
        VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(user_id) DO UPDATE SET revision=EXCLUDED.revision,object_key=EXCLUDED.object_key,saved_at=now(),round_count=EXCLUDED.round_count,attempt_count=EXCLUDED.attempt_count,bytes=EXCLUDED.bytes,sha256=EXCLUDED.sha256
        RETURNING *`, [userId, expectedRevision + 1, incoming.objectKey, incoming.roundCount, incoming.attemptCount, incoming.bytes, incoming.sha256]);
      const metadata = publicMetadata(decode(saved.rows[0]));
      await db.query('INSERT INTO cloud_upload_receipts(user_id,operation_id,expected_revision,sha256,result) VALUES($1,$2,$3,$4,$5)', [userId, operationId, expectedRevision, incoming.sha256, metadata]);
      await db.query('COMMIT');
      return { save: metadata, previousKey: previous?.objectKey ?? null, replay: false };
    } catch (error) {
      await this.rollback(db);
      throw error;
    } finally { db.release(); }
  }
  private async rollback(db: PoolClient): Promise<void> { try { await db.query('ROLLBACK'); } catch { /* A broken connection is closed by the pool. */ } }
  async isCurrentObject(key: string): Promise<boolean> {
    const result = await this.pool.query('SELECT 1 FROM cloud_saves WHERE object_key=$1', [key]);
    return Boolean(result.rows[0]);
  }
  async pruneReceipts(): Promise<void> { await this.pool.query("DELETE FROM cloud_upload_receipts WHERE created_at < now() - interval '7 days'"); }
}
