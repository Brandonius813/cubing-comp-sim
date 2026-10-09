import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from './app.js';
import { ApiError } from './errors.js';
import type { SaveService } from './saves.js';
import type { AccountDeletion } from './deletion.js';

test('API rejects unauthenticated/unverified access and uses verified ownership only', async () => {
  const requestedUsers: string[] = [];
  const save = { revision: 1, savedAt: new Date().toISOString(), roundCount: 0, attemptCount: 0, bytes: 100, sha256: 'a'.repeat(64) };
  const service = {
    metadata: async (user: string) => { requestedUsers.push(user); return save; },
    upload: async (user: string) => { requestedUsers.push(user); return save; },
    download: async (user: string) => { requestedUsers.push(user); return { save, snapshot: {} }; },
  } as unknown as SaveService;
  const app = await createApi({ saves: service, origins: ['https://example.test'], logging: false, verifyAccount: async authorization => {
    if (!authorization) throw new ApiError(401, 'auth_required');
    return { id: 'verified-user', emailVerified: authorization !== 'Bearer unverified' };
  } });
  try {
    assert.equal((await app.inject({ url: '/v1/save/metadata' })).statusCode, 401);
    assert.equal((await app.inject({ url: '/v1/save/metadata', headers: { authorization: 'Bearer unverified' } })).statusCode, 403);
    assert.equal(requestedUsers.length, 0);
    const put = await app.inject({ method: 'PUT', url: '/v1/save', headers: { authorization: 'Bearer verified', 'if-match': '"0"', 'idempotency-key': '00000000-0000-4000-8000-000000000001' }, payload: { userId: 'victim' } });
    assert.equal(put.statusCode, 200);
    assert.deepEqual(requestedUsers, ['verified-user']);
    const get = await app.inject({ url: '/v1/save', headers: { authorization: 'Bearer verified' } });
    assert.equal(get.statusCode, 200);
    assert.equal(get.headers['cache-control'], 'no-store');
  } finally { await app.close(); }
});

test('deletion endpoint ignores a requested victim ID and blocks pending accounts from cloud access', async () => {
  const received: string[] = [];
  const deletions = {
    isBlocked: async () => true,
    request: async (account: { id: string }, confirmation: unknown) => {
      assert.equal(confirmation, 'DELETE_ACCOUNT'); received.push(account.id); return { status: 'pending' };
    },
  } as unknown as AccountDeletion;
  const app = await createApi({ saves: {} as SaveService, deletions, origins: ['https://example.test'], logging: false,
    verifyAccount: async () => ({ id: 'verified-user', emailVerified: true, passwordAuthenticatedAt: Date.now() }),
  });
  try {
    const response = await app.inject({ method: 'DELETE', url: '/v1/account', payload: { confirmation: 'DELETE_ACCOUNT', userId: 'victim' } });
    assert.equal(response.statusCode, 202);
    assert.deepEqual(received, ['verified-user']);
    assert.equal((await app.inject({ url: '/v1/save/metadata' })).statusCode, 410);
  } finally { await app.close(); }
});
