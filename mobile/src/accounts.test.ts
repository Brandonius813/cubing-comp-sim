import test from 'node:test';
import assert from 'node:assert/strict';
import { createSecureStorage, type SecureKeyValue } from './accounts/secure-storage';
import { parseCallback, CALLBACK_URL, NativeAccounts, isPublicClientKey } from './accounts/auth';
import { ExplicitTransfers } from './accounts/transfers';
import type { HistorySnapshot } from '../../src/storage/validation';
import type { AccountSession, SaveMetadata } from '../../src/cloud/types';
import type { SupabaseClient, Session } from '@supabase/supabase-js';

function secureMemory() {
  const values = new Map<string, string>(); let fail: ((key: string) => boolean) | undefined;
  const raw: SecureKeyValue = { getItemAsync: async key => values.get(key) ?? null,
    setItemAsync: async (key, value) => { if (fail?.(key)) throw new Error('disk full'); values.set(key, value); },
    deleteItemAsync: async key => { values.delete(key); } };
  let id = 0;
  return { values, raw, storage: createSecureStorage(raw, () => `generation-${++id}`), failWrites: (fn?: (key: string) => boolean) => { fail = fn; } };
}
const snapshot = (): HistorySnapshot => ({ app: 'cubing-comp-sim', schemaVersion: 1, exportedAt: 1, rounds: [], activeRoundId: null });
const account = (id = 'a'): AccountSession => ({ accessToken: `${id}-token`, user: { id, email: `${id}@example.test`, emailVerified: true } });
const metadata: SaveMetadata = { revision: 1, savedAt: '2026-10-20T00:00:00Z', roundCount: 0, attemptCount: 0, bytes: 100, sha256: 'a'.repeat(64) };

test('secure sessions are chunked, stripped of provider credentials and atomically replaced', async () => {
  const memory = secureMemory();
  const raw = JSON.stringify({ access_token: 'access', refresh_token: 'refresh', provider_token: 'provider-secret', provider_refresh_token: 'provider-refresh-secret', user: { name: '漢🧊'.repeat(1000) } });
  await memory.storage.setItem('session', raw);
  const stored = JSON.parse((await memory.storage.getItem('session'))!);
  assert.equal(stored.access_token, 'access'); assert.equal(stored.provider_token, undefined); assert.equal(stored.provider_refresh_token, undefined);
  assert.equal(stored.user.name, '漢🧊'.repeat(1000));
  for (const [key, value] of memory.values) if (key !== 'ccs.session') assert.ok(Buffer.byteLength(value, 'utf8') < 2048);
  const previous = await memory.storage.getItem('session');
  memory.failWrites(key => key.endsWith('generation-2.1'));
  await assert.rejects(memory.storage.setItem('session', 'next'.repeat(500)), /disk full/);
  assert.equal(await memory.storage.getItem('session'), previous);
  memory.failWrites(); await memory.storage.removeItem('session'); assert.equal(await memory.storage.getItem('session'), null);
  assert.equal(memory.values.size, 0);
});

test('failed secure manifest commit preserves prior value and removes new chunks', async () => {
  const memory = secureMemory(); await memory.storage.setItem('session', 'first');
  memory.failWrites(key => key === 'ccs.session');
  await assert.rejects(memory.storage.setItem('session', 'replacement'), /disk full/);
  assert.equal(await memory.storage.getItem('session'), 'first');
  assert.ok(![...memory.values.keys()].some(key => key.includes('generation-2')));
});

test('incomplete and unsupported secure sessions fail visibly rather than yielding a partial credential', async () => {
  const memory = secureMemory(); await memory.storage.setItem('session', 'long'.repeat(500));
  memory.values.delete('ccs.session.generation-1.0');
  await assert.rejects(memory.storage.getItem('session'), /incomplete/);
  memory.values.set('ccs.session', JSON.stringify({ version: 2, generation: 'x', count: 1 }));
  await assert.rejects(memory.storage.getItem('session'), /Invalid secure/);
});

test('PKCE callback is bound to scheme, host, path, fresh intent and cryptographic state', () => {
  const now = Date.now(); const state = 'a'.repeat(36);
  const intent = JSON.stringify({ provider: 'google', state, startedAt: now });
  const good = `${CALLBACK_URL}?ccs_state=${state}&code=one-use`;
  assert.deepEqual(parseCallback(good, intent, now), { code: 'one-use', flowId: undefined, provider: 'google' });
  for (const url of [good.replace('cubingcompsim:', 'https:'), good.replace('/callback', '/other'), good.replace(state, 'b'.repeat(36)), `${good}&code=second`, `${good}#access_token=secret`, `${good}&error=denied`]) assert.throws(() => parseCallback(url, intent, now));
  assert.throws(() => parseCallback(good, intent, now + 601_000));
  assert.throws(() => parseCallback(good, null, now));
  assert.throws(() => parseCallback(good, JSON.stringify({ provider: 'apple', state, startedAt: now }), now));
});

test('auth restores and signs in without any cloud/history dependency; Apple stays gated', async () => {
  const memory = secureMemory(); let sdkCalls = 0;
  const rawSession = { access_token: 'token', user: { id: 'a', email: 'a@example.test', email_confirmed_at: 'today', identities: [{ provider: 'email' }] } } as Session;
  const client = { auth: { getSession: async () => { sdkCalls++; return { data: { session: rawSession }, error: null }; }, signInWithPassword: async () => ({ data: { session: rawSession }, error: null }) } } as unknown as SupabaseClient;
  const auth = new NativeAccounts({ url: 'https://example.supabase.co', publicKey: 'sb_publishable_test', providers: 'google,wca,apple' }, memory.storage, () => 'a'.repeat(36), async () => ({ type: 'cancel' }), client);
  assert.deepEqual(auth.providers, ['google', 'wca']);
  assert.equal((await auth.getSession())?.user.id, 'a');
  await auth.signIn('a@example.test', 'secret'); assert.equal(sdkCalls, 1);
});

test('preparing upload does not upload; confirmation is one use and account-bound', async () => {
  let current = account(); let uploads = 0; let replacements = 0;
  const cloud = { getSaveMetadata: async () => metadata, upload: async () => { uploads++; return metadata; }, download: async () => ({ metadata, snapshot: snapshot() }) };
  const transfers = new ExplicitTransfers(cloud, async () => current, () => 'operation');
  const ticket = await transfers.prepareUpload(snapshot()); assert.equal(uploads, 0);
  current = account('b');
  await assert.rejects(transfers.confirm(ticket, async () => { replacements++; }), /account changed/);
  assert.equal(uploads, 0); assert.equal(replacements, 0);
  current = account(); const valid = await transfers.prepareUpload(snapshot());
  await transfers.confirm(valid, async () => { replacements++; });
  assert.equal(uploads, 1); assert.equal(replacements, 0);
  await assert.rejects(transfers.confirm(valid, async () => undefined), /expired/);
});

test('invalid cloud download cannot replace local history and failed replacement remains visible', async () => {
  let replacements = 0;
  const bad = new ExplicitTransfers({ getSaveMetadata: async () => null, upload: async () => metadata,
    download: async () => ({ metadata, snapshot: { bad: true } as unknown as HistorySnapshot }) }, async () => account(), () => 'operation');
  await assert.rejects(bad.prepareDownload()); assert.equal(replacements, 0);
  const transfers = new ExplicitTransfers({ getSaveMetadata: async () => metadata, upload: async () => metadata,
    download: async () => ({ metadata, snapshot: snapshot() }) }, async () => account(), () => 'operation');
  const ticket = await transfers.prepareDownload(); assert.equal(replacements, 0);
  await assert.rejects(transfers.confirm(ticket, async () => { replacements++; throw new Error('atomic persistence rejected'); }), /atomic persistence/);
  assert.equal(replacements, 1);
  await assert.rejects(transfers.confirm(ticket, async () => undefined), /expired/);
});

test('logout/account change during download discards the remote result', async () => {
  let current = account();
  const transfers = new ExplicitTransfers({ getSaveMetadata: async () => metadata, upload: async () => metadata,
    download: async () => { current = account('b'); return { metadata, snapshot: snapshot() }; } }, async () => current, () => 'operation');
  await assert.rejects(transfers.prepareDownload(), /account changed/);
});


test('native configuration accepts only public client keys', () => {
  assert.equal(isPublicClientKey('sb_publishable_public'), true);
  assert.equal(isPublicClientKey('sb_secret_server'), false);
  const key = (role: string) => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  assert.equal(isPublicClientKey(key('anon')), true);
  assert.equal(isPublicClientKey(key('service_role')), false);
});

test('duplicate warm/browser OAuth completion exchanges one code; cancelled browser transfers nothing', async () => {
  const memory = secureMemory(); let exchanges = 0; let callback = ''; let cancelled = false;
  const session = { access_token: 'token', user: { id: 'a', identities: [{ provider: 'google' }] } } as Session;
  const client = { auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    signInWithOAuth: async (args: { options: { redirectTo: string } }) => { callback = `${args.options.redirectTo}&code=single`; return { data: { url: 'https://provider.example.test' }, error: null }; },
    exchangeCodeForSession: async () => { exchanges++; return { data: { session }, error: null }; },
  } } as unknown as SupabaseClient;
  const auth = new NativeAccounts({ url: 'https://example.supabase.co', publicKey: 'sb_publishable_test', providers: 'google' }, memory.storage, () => 'a'.repeat(36), async () => cancelled ? { type: 'cancel' } : { type: 'success', url: callback }, client);
  await auth.signInWithProvider('google'); await auth.handleCallback(callback);
  assert.equal(exchanges, 1);
  cancelled = true; await auth.signInWithProvider('google'); await auth.handleCallback(callback);
  assert.equal(exchanges, 1);
  assert.equal(await memory.storage.getItem('ccs-native-oauth-intent'), null);
});

test('revoked sessions are rejected before cloud use even when local session exists', async () => {
  const memory = secureMemory();
  const rawSession = { access_token: 'old-token', user: { id: 'a', email_confirmed_at: 'today' } } as Session;
  const client = { auth: { getSession: async () => ({ data: { session: rawSession }, error: null }),
    getUser: async () => ({ data: { user: null }, error: { message: 'revoked' } }) } } as unknown as SupabaseClient;
  const auth = new NativeAccounts({ url: 'https://example.supabase.co', publicKey: 'sb_publishable_test' }, memory.storage, () => 'a'.repeat(36), async () => ({ type: 'cancel' }), client);
  await assert.rejects(auth.verifiedSession(), /expired or was revoked/);
});
