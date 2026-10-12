import { describe, expect, it, vi } from 'vitest';
import { CloudSaves } from './api';
import { AccountAuth } from './auth';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountSession } from './types';

const session: AccountSession = { accessToken: 'private-test-token', user: { id: 'a', email: 'a@example.test', emailVerified: true } };
const metadata = { revision: 1, savedAt: '2026-10-08T12:00:00.000Z', roundCount: 0, attemptCount: 0, bytes: 123, sha256: 'a'.repeat(64) };
const snapshot = { app: 'cubing-comp-sim' as const, schemaVersion: 1 as const, exportedAt: 1, rounds: [], activeRoundId: null };

describe('optional cloud boundary', () => {
  it('does not make requests when unconfigured', async () => {
    const fetcher = vi.fn();
    await expect(new CloudSaves(undefined, fetcher).getSaveMetadata(session)).rejects.toMatchObject({ code: 'not_configured' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await new AccountAuth({}).getSession()).toBeNull();
  });
  it('requires the reviewed revision and a stable operation ID on upload', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ save: metadata })));
    await new CloudSaves('https://api.example.test', fetcher).upload(snapshot, 0, 'stable-operation', session);
    expect(fetcher).toHaveBeenCalledWith('https://api.example.test/v1/save', expect.objectContaining({ method: 'PUT', credentials: 'omit', cache: 'no-store', headers: expect.objectContaining({ 'If-Match': '"0"', 'Idempotency-Key': 'stable-operation' }) }));
  });
  it('surfaces conflicts without retrying an overwrite', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 409 }));
    await expect(new CloudSaves('https://api.example.test', fetcher).upload(snapshot, 0, 'stable-operation', session)).rejects.toMatchObject({ code: 'conflict' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects an invalid downloaded history before returning it', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ save: metadata, snapshot: { ...snapshot, schemaVersion: 99 } })));
    await expect(new CloudSaves('https://api.example.test', fetcher).download(session)).rejects.toMatchObject({ code: 'invalid_save' });
  });
  it('password recovery uses a fixed app redirect and hides account existence', async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: { status: 400, message: 'Unknown account' } });
    const client = { auth: { resetPasswordForEmail } } as unknown as SupabaseClient;
    const auth = new AccountAuth({ url: 'https://auth.example.test', publicKey: 'public', appUrl: 'https://app.example.test' }, client);
    await expect(auth.requestPasswordReset(' person@example.test ')).resolves.toBeUndefined();
    expect(resetPasswordForEmail).toHaveBeenCalledWith('person@example.test', { redirectTo: 'https://app.example.test/?account=recovery' });
  });
  it('deletion sends confirmation without any caller-controlled account ID', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'pending' }), { status: 202 }));
    await expect(new CloudSaves('https://api.example.test', fetcher).deleteAccount(session)).resolves.toEqual({ status: 'pending' });
    expect(fetcher).toHaveBeenCalledWith('https://api.example.test/v1/account', expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ confirmation: 'DELETE_ACCOUNT' }) }));
  });
  it('shows a recent-password requirement instead of an email-verification error', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'reauth_required' } }), { status: 403 }));
    await expect(new CloudSaves('https://api.example.test', fetcher).deleteAccount(session)).rejects.toMatchObject({ code: 'reauth_required' });
  });
  it('deletion reauthentication rejects a displayed account change before checking credentials', async () => {
    const sdkSession = { access_token: 'token', user: { id: 'a', email: 'a@example.test', email_confirmed_at: '2026-01-01' } };
    const signInWithPassword = vi.fn().mockResolvedValue({ data: { session: { ...sdkSession, user: { ...sdkSession.user, id: 'b' } } }, error: null });
    const client = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: sdkSession }, error: null }), signInWithPassword, startAutoRefresh: vi.fn().mockResolvedValue(undefined) } } as unknown as SupabaseClient;
    await expect(new AccountAuth({}, client).reauthenticateForDeletion('password-test', 'different-user')).rejects.toMatchObject({ code: 'auth_required' });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
  it('post-deletion signout clears only the auth cache, even if provider logout fails', async () => {
    const removeItem = vi.fn();
    vi.stubGlobal('localStorage', { removeItem, getItem: vi.fn().mockReturnValue(null) });
    const sdkSession = { access_token: 'token-a', user: { id: 'a', email: 'a@example.test' } };
    const client = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: sdkSession }, error: null }),
      admin: { signOut: vi.fn().mockResolvedValue({ error: new Error('Already deleted') }) },
      stopAutoRefresh: vi.fn().mockResolvedValue(undefined) } } as unknown as SupabaseClient;
    try {
      await new AccountAuth({}, client).signOutAfterDeletion();
      expect(client.auth.admin.signOut).toHaveBeenCalledExactlyOnceWith('token-a', 'local');
      expect(removeItem).not.toHaveBeenCalled(); // Already-empty cache needs no removal.
    } finally { vi.unstubAllGlobals(); }
  });
  it('deletion logout revokes captured A but preserves B if another tab signs in before its response', async () => {
    const a = { access_token: 'token-a', user: { id: 'a', email: 'a@example.test' } };
    const b = { access_token: 'token-b', user: { id: 'b', email: 'b@example.test' } };
    const storage = new Map([['ccs-auth-session', JSON.stringify(a)], ['history', 'local-solves'], ['ccs-auth-session-code-verifier', 'pending-b-flow']]);
    const removeItem = vi.fn((key: string) => storage.delete(key));
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, removeItem });
    let finish!: () => void;
    const revoke = vi.fn(() => new Promise<{ error: null }>(resolve => { finish = () => resolve({ error: null }); }));
    const stopAutoRefresh = vi.fn().mockResolvedValue(undefined);
    const client = { auth: {
      getSession: vi.fn(async () => ({ data: { session: JSON.parse(storage.get('ccs-auth-session') ?? 'null') }, error: null })),
      admin: { signOut: revoke }, stopAutoRefresh,
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    } } as unknown as SupabaseClient;
    const listener = vi.fn();
    try {
      const account = new AccountAuth({}, client);
      account.subscribe(listener);
      const pending = account.signOutAfterDeletion('a');
      await vi.waitFor(() => expect(revoke).toHaveBeenCalledExactlyOnceWith('token-a', 'local'));
      storage.set('ccs-auth-session', JSON.stringify(b));
      finish(); await pending;
      expect((await account.getSession())?.user.id).toBe('b');
      expect(removeItem).not.toHaveBeenCalled();
      expect(stopAutoRefresh).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();
      expect(storage.get('history')).toBe('local-solves');
      expect(storage.get('ccs-auth-session-code-verifier')).toBe('pending-b-flow');
    } finally { vi.unstubAllGlobals(); }
  });
  it('deletion cleanup clears only still-current A and restarts refresh if B arrives while its ticker stops', async () => {
    const a = { access_token: 'token-a', user: { id: 'a', email: 'a@example.test' } };
    const b = { access_token: 'token-b', user: { id: 'b', email: 'b@example.test' } };
    const storage = new Map([['ccs-auth-session', JSON.stringify(a)], ['history', 'local-solves'], ['ccs-auth-session-code-verifier', 'pending-b-flow']]);
    const removeItem = vi.fn((key: string) => storage.delete(key));
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, removeItem });
    let finishStop!: () => void;
    const stopAutoRefresh = vi.fn(() => new Promise<void>(resolve => { finishStop = resolve; }));
    const startAutoRefresh = vi.fn().mockResolvedValue(undefined);
    const client = { auth: {
      getSession: vi.fn(async () => ({ data: { session: JSON.parse(storage.get('ccs-auth-session') ?? 'null') }, error: null })),
      admin: { signOut: vi.fn().mockResolvedValue({ error: new Error('Identity already deleted') }) },
      stopAutoRefresh, startAutoRefresh,
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    } } as unknown as SupabaseClient;
    const listener = vi.fn();
    try {
      const account = new AccountAuth({}, client);
      account.subscribe(listener);
      const pending = account.signOutAfterDeletion('a');
      await vi.waitFor(() => expect(stopAutoRefresh).toHaveBeenCalledOnce());
      expect(listener).toHaveBeenCalledExactlyOnceWith(null, 'SIGNED_OUT');
      expect(removeItem.mock.calls).toEqual([['ccs-auth-session']]);
      storage.set('ccs-auth-session', JSON.stringify(b));
      finishStop(); await pending;
      expect((await account.getSession())?.user.id).toBe('b');
      expect(startAutoRefresh).toHaveBeenCalledOnce();
      expect(storage.get('history')).toBe('local-solves');
      expect(storage.get('ccs-auth-session-code-verifier')).toBe('pending-b-flow');
    } finally { vi.unstubAllGlobals(); }
  });
  it('queued cross-tab deletion notifications cannot hide a newer account session', () => {
    const target = new EventTarget();
    let current: string | null = null;
    vi.stubGlobal('window', target);
    vi.stubGlobal('localStorage', { getItem: () => current });
    const client = { auth: { onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })) } } as unknown as SupabaseClient;
    const listener = vi.fn();
    try {
      const unsubscribe = new AccountAuth({}, client).subscribe(listener);
      const removal = () => target.dispatchEvent(Object.assign(new Event('storage'), { key: 'ccs-auth-session', newValue: null }));
      current = JSON.stringify({ user: { id: 'b' } });
      removal(); expect(listener).not.toHaveBeenCalled();
      current = null;
      removal(); expect(listener).toHaveBeenCalledExactlyOnceWith(null, 'SIGNED_OUT');
      unsubscribe(); removal(); expect(listener).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });
});
