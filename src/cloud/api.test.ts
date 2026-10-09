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
  it('deletion reauthentication uses the current account and rejects an account change', async () => {
    const sdkSession = { access_token: 'token', user: { id: 'a', email: 'a@example.test', email_confirmed_at: '2026-01-01' } };
    const signInWithPassword = vi.fn().mockResolvedValue({ data: { session: { ...sdkSession, user: { ...sdkSession.user, id: 'b' } } }, error: null });
    const client = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: sdkSession }, error: null }), signInWithPassword, startAutoRefresh: vi.fn().mockResolvedValue(undefined) } } as unknown as SupabaseClient;
    await expect(new AccountAuth({}, client).reauthenticateForDeletion('password-test')).rejects.toMatchObject({ code: 'auth_required' });
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@example.test', password: 'password-test' });
  });
  it('post-deletion signout clears only the auth cache, even if provider logout fails', async () => {
    const removeItem = vi.fn();
    vi.stubGlobal('localStorage', { removeItem });
    const client = { auth: { signOut: vi.fn().mockResolvedValue({ error: new Error('Already deleted') }), stopAutoRefresh: vi.fn().mockResolvedValue(undefined) } } as unknown as SupabaseClient;
    try {
      await new AccountAuth({}, client).signOutAfterDeletion();
      expect(removeItem.mock.calls).toEqual([['ccs-auth-session']]);
    } finally { vi.unstubAllGlobals(); }
  });
});
