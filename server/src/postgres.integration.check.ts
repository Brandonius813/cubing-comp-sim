import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { PostgresSaves } from './postgres.js';
import { PostgresDeletions } from './deletion-postgres.js';
import type { StoredSave } from './contracts.js';

const connectionString = process.env.TEST_DATABASE_URL;
const requiredInCI = Boolean(process.env.CI);

function incoming(label: string): Omit<StoredSave, 'revision' | 'savedAt'> {
  return { objectKey: `integration/${label}/${randomUUID()}`, sha256: 'a'.repeat(64), bytes: 128, roundCount: 1, attemptCount: 5 };
}

/** A disposable schema contains all fixtures and forced failures. No production rows are touched. */
test('real PostgreSQL save transactions', {
  skip: !connectionString && !requiredInCI ? 'Set TEST_DATABASE_URL to run PostgreSQL integration checks.' : false,
  timeout: 45_000,
}, async t => {
  assert.ok(connectionString, 'TEST_DATABASE_URL is required in CI; repository integration tests cannot be skipped.');
  const schema = `ccs_integration_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000, statement_timeout: 10_000 });
  const pool = new Pool({ connectionString, max: 8, options: `-c search_path=${schema},public`, connectionTimeoutMillis: 5_000, statement_timeout: 10_000 });
  let created = false;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    created = true;
    for (const filename of ['001_cloud_saves.sql', '002_account_deletion.sql']) {
      await pool.query(await readFile(new URL(`../migrations/${filename}`, import.meta.url), 'utf8'));
    }
    const repository = new PostgresSaves(pool);

    await t.test('concurrent first uploads commit one save and one receipt', async () => {
      const user = randomUUID();
      const operations = [randomUUID(), randomUUID()];
      const results = await Promise.allSettled([
        repository.replace(user, 0, operations[0], incoming('first-a')),
        repository.replace(user, 0, operations[1], incoming('first-b')),
      ]);
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      const rejected = results.filter(result => result.status === 'rejected');
      assert.equal(rejected.length, 1);
      assert.equal(rejected[0].reason.code, 'revision_conflict');
      assert.equal((await repository.current(user))?.revision, 1);
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM cloud_saves WHERE user_id=$1', [user])).rows[0].count, 1);
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM cloud_upload_receipts WHERE user_id=$1', [user])).rows[0].count, 1);
    });

    await t.test('same-operation retries replay the receipt without replacing newer saves', async () => {
      const user = randomUUID();
      const operation = randomUUID();
      const firstPayload = incoming('retry');
      const initial = await Promise.all([
        repository.replace(user, 0, operation, firstPayload),
        repository.replace(user, 0, operation, firstPayload),
      ]);
      assert.deepEqual(initial[0].save, initial[1].save);
      assert.deepEqual(initial.map(result => result.replay).sort(), [false, true]);
      const secondPayload = incoming('newer');
      const second = await repository.replace(user, 1, randomUUID(), secondPayload);
      assert.equal(second.save.revision, 2);
      assert.equal(second.previousKey, firstPayload.objectKey);
      const retry = await repository.replace(user, 0, operation, firstPayload);
      assert.equal(retry.replay, true);
      assert.equal(retry.save.revision, 1);
      assert.equal((await repository.current(user))?.objectKey, secondPayload.objectKey);
      await assert.rejects(repository.replace(user, 0, operation, { ...firstPayload, sha256: 'b'.repeat(64) }), { code: 'idempotency_conflict' });
      await assert.rejects(repository.replace(user, 1, operation, firstPayload), { code: 'idempotency_conflict' });
    });

    await t.test('a locked account does not block another account', async () => {
      const blockedUser = randomUUID();
      const otherUser = randomUUID();
      const blocker = await pool.connect();
      let pending: Promise<unknown> | undefined;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await blocker.query('BEGIN');
        await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [blockedUser]);
        pending = repository.replace(blockedUser, 0, randomUUID(), incoming('blocked'));
        // Observe rejection immediately even if a later assertion fails.
        void pending.catch(() => undefined);
        const other = await Promise.race([
          repository.replace(otherUser, 0, randomUUID(), incoming('independent')),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('A separate account was blocked by another account lock.')), 5_000); }),
        ]);
        assert.equal(other.save.revision, 1);
        assert.equal(await repository.current(blockedUser), null);
        await blocker.query('COMMIT');
        await pending;
        assert.equal((await repository.current(blockedUser))?.revision, 1);
        assert.equal((await repository.current(otherUser))?.revision, 1);
      } finally {
        if (timeout) clearTimeout(timeout);
        await blocker.query('ROLLBACK').catch(() => undefined);
        blocker.release();
        await pending?.catch(() => undefined);
      }
    });

    await t.test('failure after changing the save pointer rolls back pointer and receipt together', async () => {
      const user = randomUUID();
      const original = incoming('before-rollback');
      await repository.replace(user, 0, randomUUID(), original);
      const operation = randomUUID();
      await pool.query(`CREATE FUNCTION reject_integration_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'integration_forced_receipt_failure'; END;
      $$`);
      await pool.query('CREATE TRIGGER reject_integration_receipt BEFORE INSERT ON cloud_upload_receipts FOR EACH ROW EXECUTE FUNCTION reject_integration_receipt()');
      try {
        await assert.rejects(repository.replace(user, 1, operation, incoming('must-rollback')), { message: 'integration_forced_receipt_failure' });
        const after = await repository.current(user);
        assert.equal(after?.revision, 1);
        assert.equal(after?.objectKey, original.objectKey);
        assert.equal(await repository.receipt(user, operation), null);
      } finally {
        await pool.query('DROP TRIGGER reject_integration_receipt ON cloud_upload_receipts');
        await pool.query('DROP FUNCTION reject_integration_receipt()');
      }
      const retry = await repository.replace(user, 1, operation, incoming('after-rollback'));
      assert.equal(retry.save.revision, 2);
    });

    await t.test('account deletion fences uploads and removes save and receipts atomically', async () => {
      const user = randomUUID();
      const operation = randomUUID();
      const firstPayload = incoming('delete');
      await repository.replace(user, 0, operation, firstPayload);
      const deletions = new PostgresDeletions(pool);
      await deletions.request(user);
      await assert.rejects(repository.replace(user, 1, randomUUID(), incoming('blocked-after-delete')), { code: 'account_deleting' });
      await assert.rejects(repository.replace(user, 0, operation, firstPayload), { code: 'account_deleting' });
      assert.equal(await deletions.detachCloudData(user), firstPayload.objectKey);
      assert.equal(await repository.current(user), null);
      assert.equal(await repository.receipt(user, operation), null);
      // Retain the object pointer while external object deletion is pending.
      assert.equal(await deletions.detachCloudData(user), firstPayload.objectKey);
      await deletions.complete(user);
      assert.equal(await deletions.isBlocked(user), true);
      await assert.rejects(repository.replace(user, 0, randomUUID(), incoming('cannot-resurrect')), { code: 'account_deleting' });
    });
  } finally {
    await pool.end();
    try {
      if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    } finally { await admin.end(); }
  }
});
