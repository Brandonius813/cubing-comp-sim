import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveService, uploadHeaders } from './saves.js';
import { publicMetadata, type SaveObjects, type SaveRepository, type StoredSave, type UploadReceipt } from './contracts.js';
import { ApiError } from './errors.js';
import { bearerToken } from './auth.js';

// Deliberately test-only adapters. Production always requires PostgreSQL and S3.
class TestRepository implements SaveRepository {
  saves = new Map<string, StoredSave>();
  receipts = new Map<string, UploadReceipt>();
  async current(user: string) { return this.saves.get(user) ?? null; }
  async receipt(user: string, operation: string) { return this.receipts.get(`${user}/${operation}`) ?? null; }
  async replace(user: string, expected: number, operation: string, incoming: Omit<StoredSave, 'revision' | 'savedAt'>) {
    const receipt = this.receipts.get(`${user}/${operation}`);
    if (receipt) {
      if (receipt.sha256 !== incoming.sha256 || receipt.expectedRevision !== expected) throw new ApiError(409, 'idempotency_conflict');
      return { save: receipt.save, previousKey: null, replay: true };
    }
    const previous = this.saves.get(user);
    if ((previous?.revision ?? 0) !== expected) throw new ApiError(409, 'revision_conflict');
    const save = { ...incoming, revision: expected + 1, savedAt: new Date().toISOString() };
    this.saves.set(user, save);
    const metadata = publicMetadata(save);
    this.receipts.set(`${user}/${operation}`, { expectedRevision: expected, sha256: incoming.sha256, save: metadata });
    return { save: metadata, previousKey: previous?.objectKey ?? null, replay: false };
  }
  async isCurrentObject(key: string) { return [...this.saves.values()].some(save => save.objectKey === key); }
  async pruneReceipts() {}
}
class TestObjects implements SaveObjects {
  data = new Map<string, Uint8Array>();
  failPut = false;
  async put(key: string, data: Uint8Array) { if (this.failPut) throw new Error('Simulated object-store failure'); this.data.set(key, data); }
  async get(key: string) { const value = this.data.get(key); if (!value) throw new Error('missing'); return value; }
  async delete(key: string) { this.data.delete(key); }
  async *oldObjects() { yield* this.data.keys(); }
}
const snapshot = { app: 'cubing-comp-sim', schemaVersion: 1, exportedAt: 1_700_000_000_000, rounds: [], activeRoundId: null };
const op1 = '00000000-0000-4000-8000-000000000001';
const op2 = '00000000-0000-4000-8000-000000000002';
function setup() { const repository = new TestRepository(); const objects = new TestObjects(); return { repository, objects, service: new SaveService(repository, objects) }; }

test('first upload, retry and replacement keep one current snapshot', async () => {
  const { service, objects } = setup();
  const first = await service.upload('user-a', snapshot, 0, op1);
  assert.equal(first.revision, 1);
  assert.deepEqual(await service.upload('user-a', snapshot, 0, op1), first);
  assert.equal(objects.data.size, 1);
  await service.upload('user-a', { ...snapshot, exportedAt: snapshot.exportedAt + 1 }, 1, op2);
  assert.equal(objects.data.size, 1);
  assert.equal((await service.download('user-a')).save.revision, 2);
});

test('conflicting uploads cannot silently replace a newer save', async () => {
  const { service } = setup();
  const results = await Promise.allSettled([service.upload('user-a', snapshot, 0, op1), service.upload('user-a', { ...snapshot, exportedAt: snapshot.exportedAt + 1 }, 0, op2)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.status === 409).length, 1);
  assert.equal((await service.metadata('user-a'))?.revision, 1);
});

test('failed upload and bad import never change the current save', async () => {
  const { service, objects } = setup();
  await service.upload('user-a', snapshot, 0, op1);
  objects.failPut = true;
  await assert.rejects(service.upload('user-a', snapshot, 1, op2));
  await assert.rejects(service.upload('user-a', { ...snapshot, schemaVersion: 999 }, 1, op2), { status: 422 });
  assert.equal((await service.download('user-a')).save.revision, 1);
});

test('reusing an operation ID for different bytes is rejected', async () => {
  const { service } = setup();
  await service.upload('user-a', snapshot, 0, op1);
  await assert.rejects(service.upload('user-a', { ...snapshot, exportedAt: snapshot.exportedAt + 1 }, 0, op1), { status: 409 });
});

test('one account cannot read another account and corruption fails closed', async () => {
  const { service, objects } = setup();
  await service.upload('user-a', snapshot, 0, op1);
  assert.equal(await service.metadata('user-b'), null);
  await assert.rejects(service.download('user-b'), { status: 404 });
  const [key] = objects.data.keys();
  objects.data.set(key, new Uint8Array([1, 2, 3]));
  await assert.rejects(service.download('user-a'), { status: 503 });
});

test('cleanup only removes unreferenced objects', async () => {
  const { service, objects } = setup();
  await service.upload('user-a', snapshot, 0, op1);
  objects.data.set('saves/orphan', new Uint8Array());
  assert.equal(await service.cleanup(), 1);
  assert.equal(objects.data.size, 1);
  assert.equal((await service.download('user-a')).save.revision, 1);
});

test('conditional and idempotency headers must be explicit', () => {
  assert.deepEqual(uploadHeaders('"0"', op1), { expectedRevision: 0, operationId: op1 });
  for (const value of [undefined, '*', '0', '"-1"', '"2147483647"']) assert.throws(() => uploadHeaders(value, op1));
  assert.throws(() => uploadHeaders('"0"', undefined));
  for (const value of [undefined, 'Basic abc', 'Bearer abc', 'Bearer a.b.c\n']) assert.throws(() => bearerToken(value), { status: 401 });
});

