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
});
