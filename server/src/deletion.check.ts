import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AccountDeletion, requireRecentPassword, type DeletionRepository } from './deletion.js';
import { passwordAuthenticationTime } from './auth.js';

class TestDeletions implements DeletionRepository {
  jobs = new Map<string, { completed: boolean; objectKey: string | null }>();
  saves = new Map([['user-a', 'saves/user-a/current'], ['user-b', 'saves/user-b/current']]);
  async request(user: string) { if (!this.jobs.has(user)) this.jobs.set(user, { completed: false, objectKey: null }); }
  async isBlocked(user: string) { return this.jobs.has(user); }
  async detachCloudData(user: string) {
    const job = this.jobs.get(user)!;
    job.objectKey ??= this.saves.get(user) ?? null;
    this.saves.delete(user);
    return job.objectKey;
  }
  async complete(user: string) { this.jobs.set(user, { completed: true, objectKey: null }); }
  async pending() { return [...this.jobs].filter(([, job]) => !job.completed).map(([user]) => user); }
  async pruneCompleted() {}
}
const account = () => ({ id: 'user-a', emailVerified: true, passwordAuthenticatedAt: Date.now() });

test('deletion requires actual recent password authentication and explicit confirmation', async () => {
  const repository = new TestDeletions();
  let identityCalls = 0;
  const service = new AccountDeletion(repository, { delete: async () => undefined }, async () => { identityCalls++; });
  await assert.rejects(service.request(account(), false), { status: 400 });
  await assert.rejects(service.request({ ...account(), passwordAuthenticatedAt: Date.now() - 301_000 }, 'DELETE_ACCOUNT'), { status: 403 });
  assert.equal(repository.jobs.size, 0);
  assert.equal(identityCalls, 0);
  for (const timestamp of [undefined, Number.NaN, Date.now() + 31_000]) assert.throws(() => requireRecentPassword({ ...account(), passwordAuthenticatedAt: timestamp }), { status: 403 });
});

test('token refresh or recovery does not substitute for password entry', () => {
  const old = 1_700_000_000;
  assert.equal(passwordAuthenticationTime([{ method: 'token_refresh', timestamp: old + 1_000 }]), undefined);
  assert.equal(passwordAuthenticationTime([{ method: 'recovery', timestamp: old + 1_000 }]), undefined);
  assert.equal(passwordAuthenticationTime([{ method: 'password', timestamp: old }, { method: 'token_refresh', timestamp: old + 1_000 }]), old * 1000);
  assert.equal(passwordAuthenticationTime([{ method: 'password', timestamp: '1700000000' }]), undefined);
});

test('deletion blocks the account before external calls and only removes its own data', async () => {
  const repository = new TestDeletions();
  const deletedObjects: string[] = [];
  const deletedIdentities: string[] = [];
  const service = new AccountDeletion(repository, { delete: async key => { deletedObjects.push(key); } }, async user => {
    assert.equal(await repository.isBlocked(user), true);
    deletedIdentities.push(user);
  });
  assert.deepEqual(await service.request(account(), 'DELETE_ACCOUNT'), { status: 'deleted' });
  assert.deepEqual(deletedIdentities, ['user-a']);
  assert.deepEqual(deletedObjects, ['saves/user-a/current']);
  assert.equal(repository.saves.has('user-a'), false);
  assert.equal(repository.saves.has('user-b'), true);
  assert.equal(await repository.isBlocked('user-b'), false);
});

test('provider failure leaves a durable blocked job that cleanup retries', async () => {
  const repository = new TestDeletions();
  let unavailable = true;
  const service = new AccountDeletion(repository, { delete: async () => undefined }, async () => { if (unavailable) throw new Error('provider unavailable'); });
  assert.deepEqual(await service.request(account(), 'DELETE_ACCOUNT'), { status: 'pending' });
  assert.equal(await service.isBlocked('user-a'), true);
  assert.equal(repository.saves.has('user-a'), true);
  unavailable = false;
  assert.deepEqual(await service.retryPending(), { completed: 1, pending: 0 });
  assert.equal(repository.saves.has('user-a'), false);
});

test('object deletion can resume after auth and cloud metadata were removed', async () => {
  const repository = new TestDeletions();
  let unavailable = true;
  const deleted: string[] = [];
  const service = new AccountDeletion(repository, { delete: async key => { if (unavailable) throw new Error('object service unavailable'); deleted.push(key); } }, async () => undefined);
  assert.deepEqual(await service.request(account(), 'DELETE_ACCOUNT'), { status: 'pending' });
  assert.equal(repository.saves.has('user-a'), false);
  assert.equal(repository.jobs.get('user-a')?.objectKey, 'saves/user-a/current');
  unavailable = false;
  assert.deepEqual(await service.retryPending(), { completed: 1, pending: 0 });
  assert.deepEqual(deleted, ['saves/user-a/current']);
  assert.equal(repository.jobs.get('user-a')?.objectKey, null);
});

test('accounts without cloud saves can be deleted and duplicate requests are safe', async () => {
  const repository = new TestDeletions();
  repository.saves.delete('user-a');
  let objectCalls = 0;
  const service = new AccountDeletion(repository, { delete: async () => { objectCalls++; } }, async () => undefined);
  assert.deepEqual(await service.request({ ...account(), emailVerified: false }, 'DELETE_ACCOUNT'), { status: 'deleted' });
  assert.deepEqual(await service.request(account(), 'DELETE_ACCOUNT'), { status: 'deleted' });
  assert.equal(objectCalls, 0);
});
