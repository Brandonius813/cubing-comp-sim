import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdtemp, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seal, unseal, verifySave, restore } from './backup.mjs';

test('authenticated encryption rejects wrong keys and changed archives', () => {
  const key = randomBytes(32); const value = Buffer.from('private snapshot');
  const encoded = seal(value, key);
  assert.deepEqual(unseal(encoded, key), value);
  assert.equal(encoded.includes(value), false);
  assert.throws(() => unseal(encoded, randomBytes(32)));
  encoded[encoded.length - 1] ^= 1;
  assert.throws(() => unseal(encoded, key));
});

const now = 1750000000000;
const fixture = { app: 'cubing-comp-sim', schemaVersion: 1, exportedAt: now, activeRoundId: null,
  rounds: [{ id: 'round-1', eventId: '222', format: 'ao5', createdAt: now, updatedAt: now, completedAt: now,
    attempts: Array.from({ length: 5 }, (_, index) => ({ id: `attempt-${index}`, roundId: 'round-1', index,
      rawMs: 12000 + index * 100, penalty: 'none', inspectionPenalty: 'none', inputMethod: 'manual',
      scramble: { eventId: '222', notation: "R U R'", engineVersion: 'restore-fixture', generatedAt: now }, recordedAt: now })) }] };
const raw = Buffer.from(JSON.stringify(fixture));
const compressed = gzipSync(raw);
const row = { user_id: '00000000-0000-4000-8000-000000000001', revision: 3, object_key: 'saves/fixture/one.json.gz',
  saved_at: new Date(now).toISOString(), round_count: 1, attempt_count: 5, bytes: raw.length,
  sha256: createHash('sha256').update(raw).digest('hex'), backup_file: '0.ccsbk' };

test('restore reconstructs nonempty history and refuses overwritten destinations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ccs-backup-test-'));
  try {
    const key = randomBytes(32); const keyPath = join(directory, 'key');
    await writeFile(keyPath, key, { mode: 0o600 });
    const backup = join(directory, 'backup'); await mkdir(backup);
    const manifest = { format: 1, scope: 'cloud-save-data-only', saves: [row], deletions: [], receipts: [] };
    await writeFile(join(backup, 'manifest.ccsbk'), seal(Buffer.from(JSON.stringify(manifest)), key));
    await writeFile(join(backup, '0.ccsbk'), seal(compressed, key));
    const output = join(directory, 'restored');
    const restored = await restore(keyPath, backup, output);
    assert.equal(restored.saves.length, 1);
    assert.deepEqual(JSON.parse(await readFile(join(output, '0.json'))), fixture);
    assert.deepEqual(verifySave(row, await readFile(join(output, '0.json.gz'))), fixture);
    assert.equal((await stat(output)).mode & 0o077, 0);
    assert.equal((await stat(join(output, '0.json'))).mode & 0o077, 0);
    await assert.rejects(restore(keyPath, backup, output));
    assert.deepEqual(JSON.parse(await readFile(join(output, '0.json'))), fixture);
    // Never restore a save for an account already marked for deletion.
    manifest.deletions = [{ user_id: row.user_id }];
    await writeFile(join(backup, 'manifest.ccsbk'), seal(Buffer.from(JSON.stringify(manifest)), key));
    await assert.rejects(restore(keyPath, backup, join(directory, 'blocked')));
    await assert.rejects(stat(join(directory, 'blocked')));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('restore validates checksums and counts before accepting history', () => {
  assert.throws(() => verifySave({ ...row, sha256: '0'.repeat(64) }, compressed));
  assert.throws(() => verifySave({ ...row, attempt_count: 4 }, compressed));
  assert.throws(() => verifySave(row, gzipSync(Buffer.from('{}'))));
});
