import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AccountDeletion, requireRecentAuthentication, type DeletionRepository } from './deletion.js';
import { oauthAuthenticationTime, passwordAuthenticationTime } from './auth.js';

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
  for (const timestamp of [undefined, Number.NaN, Date.now() + 31_000]) assert.throws(() => requireRecentAuthentication({ ...account(), passwordAuthenticatedAt: timestamp }), { status: 403 });
});

test('token refresh or recovery does not substitute for password entry', () => {
  const old = 1_700_000_000;
  assert.equal(passwordAuthenticationTime([{ method: 'token_refresh', timestamp: old + 1_000 }]), undefined);
  assert.equal(passwordAuthenticationTime([{ method: 'recovery', timestamp: old + 1_000 }]), undefined);
  assert.equal(passwordAuthenticationTime([{ method: 'password', timestamp: old }, { method: 'token_refresh', timestamp: old + 1_000 }]), old * 1000);
  assert.equal(passwordAuthenticationTime([{ method: 'password', timestamp: '1700000000' }]), undefined);
  for (const timestamp of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER]) {
    assert.equal(passwordAuthenticationTime([{ method: 'password', timestamp }]), undefined);
  }
});

test('OAuth reauthentication needs signed AMR and owned live allowlisted identities', () => {
  const timestamp = 1_700_000_000;
  const amr = [{ method: 'oauth', timestamp }];
  const identity = (provider = 'google', time = timestamp * 1000) => ({
    user_id: 'user-a', provider, last_sign_in_at: new Date(time).toISOString(),
  });
  for (const provider of ['google', 'custom:wca']) {
    assert.equal(oauthAuthenticationTime(amr, 'user-a', [identity(provider)]), timestamp * 1000);
  }
  assert.equal(oauthAuthenticationTime(amr, 'user-a', [identity('email'), identity('google')]), timestamp * 1000);
  for (const identities of [undefined, [], [null], [identity('github')], [identity('wca')],
    [identity('custom:other')], [identity('google'), identity('github')], [{ ...identity(), user_id: 'victim' }]]) {
    assert.equal(oauthAuthenticationTime(amr, 'user-a', identities), undefined);
  }
  for (const method of ['token_refresh', 'recovery', 'magiclink', 'otp', 'totp', 'sso/saml']) {
    assert.equal(oauthAuthenticationTime([{ method, timestamp }], 'user-a', [identity()]), undefined);
  }
  assert.equal(oauthAuthenticationTime([{ method: 'oauth', timestamp: String(timestamp) }], 'user-a', [identity()]), undefined);
  // A user-supplied provider/name/timestamp inside identity_data is not evidence.
  assert.equal(oauthAuthenticationTime(amr, 'user-a', [{ ...identity('email'), identity_data: identity() }]), undefined);
});

test('existing-account OAuth accepts server AMR even when live identity sign-in timestamps are stale', () => {
  const now = 1_700_000_000_000;
  const identity = (at: number) => [{ user_id: 'user-a', provider: 'google', last_sign_in_at: new Date(at).toISOString() }];
  const oauthTime = (amrAt: number, identityAt: number) => oauthAuthenticationTime([
    { method: 'oauth', timestamp: amrAt / 1000 }, { method: 'token_refresh', timestamp: now / 1000 },
  ], 'user-a', identity(identityAt));
  assert.equal(oauthTime(now, now - 60_000), now);
  assert.equal(oauthTime(now - 60_000, now - 45_000), now - 60_000);
  assert.equal(oauthTime(now, now - 86_400_000), now);
  assert.equal(oauthAuthenticationTime([{ method: 'oauth', timestamp: now / 1000 }], 'user-a', [{ user_id: 'user-a', provider: 'google' }]), now);
  const stale = oauthTime(now - 301_000, now);
  assert.equal(stale, now - 301_000);
  assert.throws(() => requireRecentAuthentication({ id: 'user-a', emailVerified: true, oauthAuthenticatedAt: stale }, now), { status: 403 });
});

test('fresh Google or WCA authentication can delete an account without a password', async () => {
  for (const provider of ['google', 'custom:wca']) {
    const now = Date.now();
    const oauthAuthenticatedAt = oauthAuthenticationTime([{ method: 'oauth', timestamp: Math.floor(now / 1000) }], 'user-a', [
      { user_id: 'user-a', provider, last_sign_in_at: new Date(now).toISOString() },
    ]);
    const repository = new TestDeletions();
    const deleted: string[] = [];
    const service = new AccountDeletion(repository, { delete: async () => undefined }, async userId => { deleted.push(userId); });
    assert.deepEqual(await service.request({ id: 'user-a', emailVerified: true, oauthAuthenticatedAt }, 'DELETE_ACCOUNT'), { status: 'deleted' });
    assert.deepEqual(deleted, ['user-a']);
    assert.equal(repository.saves.has('user-b'), true);
  }
});

test('stale or missing social authentication never creates deletion work', async () => {
  const repository = new TestDeletions();
  let identityCalls = 0;
  const service = new AccountDeletion(repository, { delete: async () => undefined }, async () => { identityCalls++; });
  for (const oauthAuthenticatedAt of [undefined, Date.now() - 301_000, Date.now() + 31_000, Number.NaN]) {
    await assert.rejects(service.request({ id: 'user-a', emailVerified: true, oauthAuthenticatedAt }, 'DELETE_ACCOUNT'), { status: 403 });
  }
  assert.equal(identityCalls, 0);
  assert.equal(repository.jobs.size, 0);
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
