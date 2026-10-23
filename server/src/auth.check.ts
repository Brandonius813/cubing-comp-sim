import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createAccountVerifier } from './auth.js';

test('account verifier uses a verified JWT and a live matching user, never editable metadata', async t => {
  const url = 'https://ccs-auth.test';
  const id = '00000000-0000-4000-8000-000000000001';
  const now = Math.floor(Date.now() / 1000);
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const claims = { iss: `${url}/auth/v1`, sub: id, aud: 'authenticated', role: 'authenticated',
    exp: now + 3600, iat: now, amr: [{ method: 'oauth', timestamp: now }] };
  const jwt = (overrides: Record<string, unknown> = {}, signingKey = privateKey) => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ ...claims, ...overrides })).toString('base64url');
    const input = `${header}.${payload}`;
    return `${input}.${sign('RSA-SHA256', Buffer.from(input), signingKey).toString('base64url')}`;
  };
  const supportedIdentity = { user_id: id, provider: 'google', last_sign_in_at: new Date(now * 1000).toISOString() };
  let user: Record<string, unknown> | null = { id, email_confirmed_at: new Date().toISOString(), identities: [supportedIdentity] };
  let liveLookups = 0;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (requestUrl === `${url}/auth/v1/.well-known/jwks.json`) return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
    if (requestUrl === `${url}/auth/v1/user`) {
      liveLookups++;
      return new Response(JSON.stringify(user ?? { code: 'user_not_found', message: 'User not found' }), { status: user ? 200 : 401 });
    }
    throw new Error('Unexpected auth request');
  });
  const verify = createAccountVerifier(url, 'test-publishable-key');
  assert.deepEqual(await verify(`Bearer ${jwt()}`), { id, emailVerified: true, appleIdentityLinked: false, passwordAuthenticatedAt: undefined, oauthAuthenticatedAt: now * 1000 });
  const { privateKey: wrongKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const beforeForgery = liveLookups;
  await assert.rejects(verify(`Bearer ${jwt({}, wrongKey)}`), { status: 401 });
  assert.equal(liveLookups, beforeForgery);
  for (const overrides of [{ iss: 'https://another-project.test/auth/v1' }, { role: 'service_role' }, { aud: 'anon' }, { exp: now - 1 }]) {
    await assert.rejects(verify(`Bearer ${jwt(overrides)}`), { status: 401 });
  }
  user = { id: '00000000-0000-4000-8000-000000000002', email_confirmed_at: new Date().toISOString() };
  await assert.rejects(verify(`Bearer ${jwt()}`), { status: 401 });
  user = null;
  await assert.rejects(verify(`Bearer ${jwt()}`), { status: 401 });
  user = { id, identities: [{ ...supportedIdentity, provider: 'email' }],
    user_metadata: { provider: 'google', oauthAuthenticatedAt: now * 1000, email_verified: true },
    app_metadata: { provider: 'google' } };
  assert.deepEqual(await verify(`Bearer ${jwt({ user_metadata: { provider: 'google', oauthAuthenticatedAt: now * 1000 } })}`),
    { id, emailVerified: false, appleIdentityLinked: false, passwordAuthenticatedAt: undefined, oauthAuthenticatedAt: undefined });
  user = { id, identities: [{ ...supportedIdentity, provider: 'apple' }, { ...supportedIdentity, provider: 'email' }] };
  assert.equal((await verify(`Bearer ${jwt({ amr: [{ method: 'password', timestamp: now }] })}`)).appleIdentityLinked, true);
  user = { id, identities: [{ ...supportedIdentity, provider: 'email' }], user_metadata: { provider: 'apple', appleIdentityLinked: true } };
  assert.equal((await verify(`Bearer ${jwt()}`)).appleIdentityLinked, false);
  user = { id, is_anonymous: true, identities: [supportedIdentity] };
  await assert.rejects(verify(`Bearer ${jwt()}`), { status: 401 });
});
