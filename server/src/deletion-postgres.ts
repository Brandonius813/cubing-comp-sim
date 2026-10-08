import type { Pool } from 'pg';
import type { DeletionRepository } from './deletion.js';

export class PostgresDeletions implements DeletionRepository {
  constructor(private readonly pool: Pool) {}
  async request(userId: string): Promise<void> {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [userId]);
      await db.query('INSERT INTO account_deletions(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING', [userId]);
      await db.query('COMMIT');
    } catch (error) { await db.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { db.release(); }
  }
  async isBlocked(userId: string): Promise<boolean> {
    const result = await this.pool.query('SELECT 1 FROM account_deletions WHERE user_id=$1', [userId]);
    return Boolean(result.rows[0]);
  }
  async detachCloudData(userId: string): Promise<string | null> {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [userId]);
      const request = await db.query('SELECT object_key FROM account_deletions WHERE user_id=$1 FOR UPDATE', [userId]);
      if (!request.rows[0]) throw new Error('Deletion request missing');
      const save = await db.query('SELECT object_key FROM cloud_saves WHERE user_id=$1', [userId]);
      const objectKey: string | null = request.rows[0].object_key ?? save.rows[0]?.object_key ?? null;
      // Keep the object pointer in the durable job until object deletion succeeds.
      await db.query('UPDATE account_deletions SET object_key=$2 WHERE user_id=$1', [userId, objectKey]);
      await db.query('DELETE FROM cloud_saves WHERE user_id=$1', [userId]);
      await db.query('DELETE FROM cloud_upload_receipts WHERE user_id=$1', [userId]);
      await db.query('COMMIT');
      return objectKey;
    } catch (error) { await db.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { db.release(); }
  }
  async complete(userId: string): Promise<void> {
    await this.pool.query('UPDATE account_deletions SET completed_at=COALESCE(completed_at,now()),object_key=NULL WHERE user_id=$1', [userId]);
  }
  async pending(): Promise<string[]> {
    const result = await this.pool.query('SELECT user_id FROM account_deletions WHERE completed_at IS NULL ORDER BY requested_at LIMIT 100');
    return result.rows.map(row => String(row.user_id));
  }
  async pruneCompleted(): Promise<void> {
    await this.pool.query("DELETE FROM account_deletions WHERE completed_at < now() - interval '7 days'");
  }
}
