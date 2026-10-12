import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { AccountAuth } from './auth';

const idA = '00000000-0000-4000-8000-000000000001';
const idB = '00000000-0000-4000-8000-000000000002';
const accounts: AccountAuth[] = [];
function session(id: string, marker: string): Session {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const encoded = btoa(JSON.stringify({ sub: id, exp, marker })).replace(/=+$/, '').replaceAll('+', '-').replaceAll('/', '_');
  const token = `eyJhbGciOiJIUzI1NiJ9.${encoded}.dGVzdHNpZ25hdHVyZQ`;
  return { access_token: token, refresh_token: `test-refresh-${marker}`, token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id, email: id === idA ? 'a@example.test' : 'b@example.test', email_confirmed_at: '2026-01-01',
      aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01',
      identities: [{ id, identity_id: id, user_id: id, provider: 'email', created_at: '2026-01-01', updated_at: '2026-01-01' }] } };
}
function setup() {
  const storage = new Map<string, string>();
  const requests: { path: string; method: string; token: string | null; body: Record<string, unknown> }[] = [];
  let release!: () => void;
  let held: 'password' | 'update' | undefined;
  vi.stubGlobal('location', new URL('https://app.example.test/'));
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? 'GET';
    const token = new Headers(init?.headers).get('Authorization')?.replace(/^Bearer /, '') ?? null;
    const id = token?.includes('.') ? JSON.parse(atob(token.split('.')[1])).sub : idA;
    requests.push({ path: url.pathname + url.search, method, token, body: JSON.parse(String(init?.body ?? '{}')) });
    if (url.pathname.endsWith('/user') && method === 'GET') return new Response(JSON.stringify(session(id, 'lookup').user));
    if (url.pathname.endsWith('/user') && method === 'PUT') {
      if (held === 'update') await new Promise<void>(resolve => { release = resolve; });
      return new Response(JSON.stringify(session(id, 'updated').user));
    }
    if (url.pathname.endsWith('/token') && url.searchParams.get('grant_type') === 'password') {
      if (held === 'password') await new Promise<void>(resolve => { release = resolve; });
      return new Response(JSON.stringify(session(idA, 'password-proof')));
    }
    if (url.pathname.endsWith('/logout')) return new Response('{}');
    throw new Error('Unexpected auth request');
  }));
  const account = new AccountAuth({ url: 'https://ccs-operations.example.test', publicKey: 'test-publishable-key', appUrl: 'https://app.example.test' });
  accounts.push(account);
  const primary = (account as unknown as { client: SupabaseClient }).client;
  return { account, primary, storage, requests, hold: (operation: 'password' | 'update') => { held = operation; }, release: () => release() };
}
afterEach(async () => {
  for (const account of accounts.splice(0)) await account.signOutAfterDeletion();
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe('account-bound credential operations with the actual Supabase SDK', () => {
  it('checks a password in isolation and returns its fresh proof without replacing the primary session', async () => {
    const { account, primary, storage, requests } = setup();
    const original = session(idA, 'original-a');
    await primary.auth.setSession(original);
    const before = storage.get('ccs-auth-session');
    const proof = await account.reauthenticateForDeletion('test-password', idA);
    expect(proof.accessToken).toBe(session(idA, 'password-proof').access_token);
    expect((await account.getSession())?.accessToken).toBe(original.access_token);
    expect(storage.get('ccs-auth-session')).toBe(before);
    expect([...storage.keys()]).toEqual(['ccs-auth-session']);
    expect(requests.find(request => request.path.includes('grant_type=password'))?.body.email).toBe('a@example.test');
  });
  it('a delayed password proof cannot overwrite account B and revokes only the unused proof session', async () => {
    const { account, primary, storage, requests, hold, release } = setup();
    await primary.auth.setSession(session(idA, 'original-a'));
    hold('password');
    const pending = account.reauthenticateForDeletion('test-password', idA);
    const rejected = expect(pending).rejects.toMatchObject({ code: 'auth_required' });
    await vi.waitFor(() => expect(requests.some(request => request.path.includes('grant_type=password'))).toBe(true));
    await primary.auth.setSession(session(idB, 'new-b'));
    const before = storage.get('ccs-auth-session');
    release(); await rejected;
    expect((await account.getSession())?.user.id).toBe(idB);
    expect(storage.get('ccs-auth-session')).toBe(before);
    const revocation = requests.find(request => request.path.includes('/logout?scope=local'));
    expect(revocation?.token).toBe(session(idA, 'password-proof').access_token);
  });
  it('password updates and other-session revocation target A without writing shared credentials', async () => {
    const { account, primary, storage, requests } = setup();
    const original = session(idA, 'original-a');
    await primary.auth.setSession(original);
    const before = storage.get('ccs-auth-session');
    await account.updatePassword('test-new-password', idA);
    expect(storage.get('ccs-auth-session')).toBe(before);
    expect([...storage.keys()]).toEqual(['ccs-auth-session']);
    expect(requests.find(request => request.method === 'PUT')?.token).toBe(original.access_token);
    expect(requests.find(request => request.path.includes('/logout?scope=others'))?.token).toBe(original.access_token);
  });
  it('a delayed password update for A never replaces B credentials or targets B password/sessions', async () => {
    const { account, primary, storage, requests, hold, release } = setup();
    const original = session(idA, 'original-a');
    await primary.auth.setSession(original);
    hold('update');
    const pending = account.updatePassword('test-new-password', idA);
    const rejected = expect(pending).rejects.toMatchObject({ code: 'auth_required' });
    await vi.waitFor(() => expect(requests.some(request => request.method === 'PUT')).toBe(true));
    await primary.auth.setSession(session(idB, 'new-b'));
    const before = storage.get('ccs-auth-session');
    release(); await rejected;
    expect((await account.getSession())?.user.id).toBe(idB);
    expect(storage.get('ccs-auth-session')).toBe(before);
    expect(requests.filter(request => request.method === 'PUT')).toHaveLength(1);
    expect(requests.find(request => request.method === 'PUT')?.token).toBe(original.access_token);
    expect(requests.find(request => request.path.includes('/logout?scope=others'))?.token).toBe(original.access_token);
  });
});
