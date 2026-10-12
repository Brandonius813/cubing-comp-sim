import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AccountAuth, withoutProviderTokens } from './auth';

const config = { appUrl: 'https://app.example.test', providers: 'google,wca' };
function browser(url = 'https://app.example.test/') {
  const storage = new Map<string, string>();
  const sessionStorage = { getItem: vi.fn((key: string) => storage.get(key) ?? null), setItem: vi.fn((key: string, value: string) => storage.set(key, value)), removeItem: vi.fn((key: string) => storage.delete(key)) };
  const replaceState = vi.fn();
  vi.stubGlobal('location', new URL(url));
  vi.stubGlobal('window', { location: new URL(url), history: { state: null, replaceState } });
  vi.stubGlobal('sessionStorage', sessionStorage);
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'ccs-auth-session-code-verifier' ? JSON.stringify('test-verifier') : null });
  return { storage, sessionStorage, replaceState };
}
function sdk(id = 'user-a', providers = ['google']) {
  const session = { access_token: 'app-token', user: { id, email: 'solver@example.test', email_confirmed_at: '2026-01-01', identities: providers.map(provider => ({ provider })) } };
  const methods = {
    initialize: vi.fn().mockResolvedValue({ error: null }),
    exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: 'https://provider.example.test' }, error: null }),
    linkIdentity: vi.fn().mockResolvedValue({ data: {}, error: null }),
  };
  return { methods, client: { auth: methods } as unknown as SupabaseClient };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('provider sign-in boundary', () => {
  it('keeps mistyped deployment config from breaking guest use', async () => {
    const account = new AccountAuth({ ...config, appUrl: 'not a URL' });
    expect(account.configured).toBe(false);
    expect(await account.getSession()).toBeNull();
  });
  it('gates unavailable providers without starting a request', async () => {
    browser(); const { client, methods } = sdk();
    const account = new AccountAuth({ ...config, providers: '' }, client);
    await expect(account.signInWithProvider('google')).rejects.toMatchObject({ code: 'not_configured' });
    expect(methods.signInWithOAuth).not.toHaveBeenCalled();
  });
  it('uses fixed redirects and maps WCA to its custom provider', async () => {
    const { sessionStorage } = browser(); const { client, methods } = sdk();
    methods.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await new AccountAuth(config, client).signInWithProvider('wca');
    expect(methods.signInWithOAuth).toHaveBeenCalledWith({ provider: 'custom:wca', options: { redirectTo: 'https://app.example.test/?account=signin' } });
    expect(sessionStorage.setItem).toHaveBeenCalledWith('ccs-oauth-intent', expect.any(String));
  });
  it('links from an authenticated account and binds its ID to the intent', async () => {
    const { storage } = browser(); const { client, methods } = sdk();
    await new AccountAuth(config, client).linkProvider('wca');
    expect(methods.linkIdentity).toHaveBeenCalledWith(expect.objectContaining({ provider: 'custom:wca' }));
    expect(JSON.parse(storage.get('ccs-oauth-intent')!)).toMatchObject({ purpose: 'link', userId: 'user-a' });
  });
  it('requires a connected identity for deletion', async () => {
    browser(); const { client, methods } = sdk();
    await expect(new AccountAuth(config, client).reauthenticateWithProvider('wca')).rejects.toMatchObject({ code: 'auth_required' });
    expect(methods.signInWithOAuth).not.toHaveBeenCalled();
  });
  it('rejects linking, reauthentication and password updates for a changed account', async () => {
    browser(); const { client, methods } = sdk('user-b');
    const account = new AccountAuth(config, client);
    await expect(account.linkProvider('google', 'user-a')).rejects.toMatchObject({ code: 'auth_required' });
    await expect(account.reauthenticateWithProvider('google', 'user-a')).rejects.toMatchObject({ code: 'auth_required' });
    await expect(account.reauthenticateForDeletion('test-password', 'user-a')).rejects.toMatchObject({ code: 'auth_required' });
    await expect(account.updatePassword('test-password', 'user-a')).rejects.toMatchObject({ code: 'auth_required' });
    expect(methods.linkIdentity).not.toHaveBeenCalled();
    expect(methods.signInWithOAuth).not.toHaveBeenCalled();
  });
  it('does not clear another account after an in-flight deletion finishes', async () => {
    browser(); const { client } = sdk('user-b');
    await expect(new AccountAuth(config, client).signOutAfterDeletion('user-a')).resolves.toBeUndefined();
    // This client deliberately has no signOut: touching it would fail the test.
  });
  it('clears intent on provider errors', async () => {
    const { storage } = browser(); const { client, methods } = sdk();
    methods.signInWithOAuth.mockResolvedValue({ data: {}, error: new Error('private raw detail') });
    await expect(new AccountAuth(config, client).reauthenticateWithProvider('google')).rejects.toMatchObject({ code: 'auth_error' });
    expect(storage.has('ccs-oauth-intent')).toBe(false);
  });
  it('consumes one successful deletion callback but does not delete anything', async () => {
    const { storage, replaceState } = browser('https://app.example.test/?account=delete&code=private-code&other=keep');
    storage.set('ccs-oauth-intent', JSON.stringify({ purpose: 'delete', provider: 'google', userId: 'user-a', startedAt: Date.now() }));
    const { client, methods } = sdk(); const account = new AccountAuth(config, client);
    expect(await account.completeRedirect()).toEqual({ purpose: 'delete', provider: 'google', status: 'success' });
    expect((await account.reauthenticatedDeletionSession()).user.id).toBe('user-a');
    expect(replaceState).toHaveBeenCalledWith(null, '', '/?other=keep');
    expect(storage.has('ccs-oauth-intent')).toBe(false);
    await account.completeRedirect(); expect(methods.initialize).toHaveBeenCalledTimes(1);
    expect(methods.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith('private-code', undefined);
  });
  it.each(['other-user', 'same-user-missing-code', 'expired', 'exchange-error'])('fails closed for %s deletion callbacks', async variant => {
    const { storage } = browser(`https://app.example.test/?account=delete${variant === 'same-user-missing-code' ? '' : '&code=private-code'}`);
    storage.set('ccs-oauth-intent', JSON.stringify({ purpose: 'delete', provider: 'google', userId: 'user-a', startedAt: Date.now() - (variant === 'expired' ? 11 * 60_000 : 0) }));
    const { client, methods } = sdk(variant === 'other-user' ? 'user-b' : 'user-a');
    if (variant === 'exchange-error') methods.initialize.mockResolvedValue({ error: new Error('invalid exchange') });
    const account = new AccountAuth(config, client);
    expect(await account.completeRedirect()).toMatchObject({ status: 'error' });
    await expect(account.reauthenticatedDeletionSession()).rejects.toMatchObject({ code: 'reauth_required' });
  });
  it('redacts provider cancellation details and removes callback credentials', async () => {
    const { replaceState } = browser('https://app.example.test/?account=signin&error=access_denied&error_description=private-detail#provider_token=secret');
    const { client } = sdk();
    expect(await new AccountAuth(config, client).completeRedirect()).toEqual({ purpose: 'signin', provider: undefined, status: 'error' });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/');
  });
  it('rejects mixed implicit credentials and OAuth code before restoration', async () => {
    const { storage, replaceState } = browser('https://app.example.test/?account=delete&code=fake#access_token=hash-token&refresh_token=hash-refresh&type=recovery');
    storage.set('ccs-oauth-intent', JSON.stringify({ purpose: 'delete', provider: 'google', userId: 'user-a', startedAt: Date.now() }));
    const { client, methods } = sdk();
    const account = new AccountAuth(config, client);
    expect(await account.completeRedirect()).toMatchObject({ status: 'error' });
    expect(methods.initialize).not.toHaveBeenCalled();
    await expect(account.reauthenticatedDeletionSession()).rejects.toMatchObject({ code: 'reauth_required' });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/');
  });
  it('drops provider API tokens without removing the app session or PKCE verifier', () => {
    expect(JSON.parse(withoutProviderTokens(JSON.stringify({ access_token: 'app', refresh_token: 'refresh', provider_token: 'provider', provider_refresh_token: 'provider-refresh' })))).toEqual({ access_token: 'app', refresh_token: 'refresh' });
    expect(withoutProviderTokens('verifier')).toBe('verifier');
  });
  it.each(['missing', 'expired', 'wrong-purpose'])('never exchanges a code with %s intent', async variant => {
    const { storage } = browser('https://app.example.test/?account=delete&code=private-code');
    if (variant !== 'missing') storage.set('ccs-oauth-intent', JSON.stringify({
      purpose: variant === 'wrong-purpose' ? 'link' : 'delete', provider: 'google', userId: 'user-a',
      startedAt: Date.now() - (variant === 'expired' ? 11 * 60_000 : 0),
    }));
    const { client, methods } = sdk();
    expect(await new AccountAuth(config, client).completeRedirect()).toMatchObject({ status: 'error' });
    expect(methods.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it('passes the callback flow ID to the supported SDK exchange and removes it from the URL', async () => {
    const flowId = 'a'.repeat(32);
    const { storage, replaceState } = browser(`https://app.example.test/?account=delete&code=private-code&sb_flow_id=${flowId}`);
    storage.set('ccs-oauth-intent', JSON.stringify({ purpose: 'delete', provider: 'google', userId: 'user-a', startedAt: Date.now() }));
    const { client, methods } = sdk();
    expect(await new AccountAuth(config, client).completeRedirect()).toMatchObject({ status: 'success' });
    expect(methods.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith('private-code', { flowId });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/');
  });
  it('an unsuccessful exchange never turns an existing cached session into deletion proof', async () => {
    const { storage } = browser('https://app.example.test/?account=delete&code=private-code');
    storage.set('ccs-oauth-intent', JSON.stringify({ purpose: 'delete', provider: 'google', userId: 'user-a', startedAt: Date.now() }));
    const { client, methods } = sdk();
    methods.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: new Error('Missing verifier') });
    const account = new AccountAuth(config, client);
    expect(await account.completeRedirect()).toMatchObject({ status: 'error' });
    await expect(account.reauthenticatedDeletionSession()).rejects.toMatchObject({ code: 'reauth_required' });
  });
});
