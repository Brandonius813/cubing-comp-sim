import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { AppleGrants, type AppleGrantStore } from './apple.js';
import { AccountDeletion, type DeletionRepository } from './deletion.js';

function fixture() {
  const rows = new Map<string, { clientId: string; encrypted: string }>();
  const store: AppleGrantStore = {
    save: async (user, clientId, encrypted) => { rows.set(user, { clientId, encrypted }); },
    list: async user => rows.has(user) ? [rows.get(user)!] : [],
    remove: async user => { rows.delete(user); },
  };
  const privateKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  const calls: { url: string; body: URLSearchParams }[] = [];
  let fail = false; let subject = 'apple-subject';
  const request = (async (url, init) => {
    calls.push({ url: String(url), body: init!.body as URLSearchParams });
    return new Response(JSON.stringify({ id_token: 'verified-token', refresh_token: 'private-refresh' }), { status: fail ? 503 : 200 });
  }) as typeof fetch;
  const service = new AppleGrants({ teamId: 'TEAM', keyId: 'KEY', privateKey, encryptionKey: Buffer.alloc(32, 8).toString('base64'), clients: ['native', 'web'] }, store, request,
    async (_token, audience) => { assert.ok(['native', 'web'].includes(audience)); return { sub: subject }; });
  return { service, rows, calls, fail: (value: boolean) => { fail = value; }, subject: (value: string) => { subject = value; } };
}
const account = { id: 'user-a', emailVerified: true, appleIdentityLinked: true, appleSubject: 'apple-subject', oauthAuthenticatedAt: Date.now() };

test('native code is exchanged, identity checked and encrypted before revocation', async () => {
  const f = fixture();
  await f.service.capture(account, { clientId: 'native', code: 'one-use-code' });
  assert.equal(f.calls[0].body.get('grant_type'), 'authorization_code');
  assert.equal(f.calls[0].body.get('code'), 'one-use-code');
  assert.equal(f.rows.get(account.id)!.encrypted.includes('private-refresh'), false);
  await f.service.revoke(account.id);
  assert.equal(f.calls[1].url, 'https://appleid.apple.com/auth/revoke');
  assert.equal(f.calls[1].body.get('token'), 'private-refresh');
  assert.equal(f.rows.size, 0);
});
test('browser refresh grant is verified through Apple, never trusted from client claims', async () => {
  const f = fixture();
  await f.service.capture(account, { clientId: 'web', refreshToken: 'browser-refresh' });
  assert.equal(f.calls[0].body.get('grant_type'), 'refresh_token');
  f.subject('another-apple-account');
  await assert.rejects(f.service.capture(account, { clientId: 'native', code: 'wrong-account' }), { code: 'apple_identity_mismatch' });
  assert.equal(f.rows.get(account.id)!.clientId, 'web');
  await assert.rejects(f.service.capture(account, { clientId: 'unapproved', code: 'code' }), { code: 'invalid_apple_grant' });
  await assert.rejects(f.service.capture(account, { clientId: 'native', code: 'code', refreshToken: 'token' }), { code: 'invalid_apple_grant' });
});
test('failed revocation retains encrypted credentials and swapped ciphertext fails closed', async () => {
  const f = fixture(); await f.service.capture(account, { clientId: 'native', code: 'code' });
  f.fail(true);
  await assert.rejects(f.service.revoke(account.id));
  assert.equal(f.rows.size, 1);
  f.rows.set('user-b', f.rows.get(account.id)!);
  f.fail(false);
  await assert.rejects(f.service.revoke('user-b'));
  assert.equal(f.calls.length, 2);
  await f.service.revoke(account.id);
  assert.equal(f.rows.has(account.id), false);
});
test('durable deletion cannot bypass revocation when Apple configuration is removed', async () => {
  let blocked = false; let required = false; let complete = false; let identityCalls = 0; let revoked = 0;
  const repository: DeletionRepository = {
    request: async (_id, apple) => { blocked = true; required = Boolean(apple); },
    isBlocked: async () => blocked, needsAppleRevocation: async () => required,
    markAppleRevoked: async () => { required = false; },
    detachCloudData: async () => null, complete: async () => { complete = true; },
    pending: async () => blocked && !complete ? [account.id] : [], pruneCompleted: async () => {},
  };
  const remove = async () => { identityCalls++; };
  const failingApple = { hasGrant: async () => true, revoke: async () => { assert.equal(blocked, true); throw new Error('offline'); } };
  const first = new AccountDeletion(repository, { delete: async () => {} }, remove, () => {}, failingApple);
  assert.deepEqual(await first.request(account, 'DELETE_ACCOUNT'), { status: 'pending' });
  assert.equal(identityCalls, 0);
  const missingConfig = new AccountDeletion(repository, { delete: async () => {} }, remove);
  assert.deepEqual(await missingConfig.retryPending(), { completed: 0, pending: 1 });
  assert.equal(identityCalls, 0);
  const repaired = new AccountDeletion(repository, { delete: async () => {} }, remove, () => {}, {
    hasGrant: async () => true, revoke: async () => { revoked++; },
  });
  assert.deepEqual(await repaired.retryPending(), { completed: 1, pending: 0 });
  assert.equal(revoked, 1); assert.equal(identityCalls, 1);
});
