import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AccountAuth } from './auth';

const configuration = { url: 'https://ccs-auth.example.test', publicKey: 'test-publishable-key',
  appUrl: 'https://app.example.test', providers: 'google,wca' };
const activeAccounts: AccountAuth[] = [];

function setup(callbackUrl?: string) {
  const authStorage = new Map<string, string>();
  const intents = new Map<string, string>();
  const location = new URL(callbackUrl ?? configuration.appUrl);
  vi.stubGlobal('location', location);
  const replaceState = vi.fn();
  if (callbackUrl) {
    vi.stubGlobal('window', { location, history: { state: null, replaceState }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal('document', { visibilityState: 'hidden' });
  }
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => authStorage.get(key) ?? null,
    setItem: (key: string, value: string) => authStorage.set(key, value),
    removeItem: (key: string) => authStorage.delete(key),
  });
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => intents.get(key) ?? null,
    setItem: (key: string, value: string) => intents.set(key, value),
    removeItem: (key: string) => intents.delete(key),
  });
  const requests: { url: URL; body: Record<string, unknown> }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const body = JSON.parse(String(init?.body ?? '{}'));
    requests.push({ url, body });
    if (url.pathname === '/auth/v1/signup') return new Response(JSON.stringify({
      id: '00000000-0000-4000-8000-000000000001', email: 'solver@example.test', identities: [{ provider: 'email' }],
    }), { status: 200 });
    if (url.pathname === '/auth/v1/recover') return new Response('{}', { status: 200 });
    if (url.pathname === '/auth/v1/user') return new Response(JSON.stringify({
      id: '00000000-0000-4000-8000-000000000001', email: 'solver@example.test',
      email_confirmed_at: '2026-01-01', identities: [{ provider: 'email' }],
    }), { status: 200 });
    if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204 });
    throw new Error('Unexpected auth request');
  }));
  const account = new AccountAuth(configuration);
  activeAccounts.push(account);
  return { account, requests, authStorage, intents, replaceState };
}

afterEach(async () => {
  for (const account of activeAccounts.splice(0)) await account.signOutAfterDeletion();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('real Supabase SDK email flow compatibility', () => {
  it('sends email signup without a browser-bound PKCE challenge', async () => {
    const { account, requests, authStorage } = setup();
    expect(await account.signUp(' solver@example.test ', 'test-password-placeholder')).toBeNull();
    expect(requests).toHaveLength(1);
    expect(requests[0].url.pathname).toBe('/auth/v1/signup');
    expect(requests[0].url.searchParams.get('redirect_to')).toBe(`${configuration.appUrl}/`);
    expect(requests[0].body.email).toBe('solver@example.test');
    expect(requests[0].body.code_challenge).toBeNull();
    expect(requests[0].body.code_challenge_method).toBeNull();
    expect(authStorage.has('ccs-auth-session-code-verifier')).toBe(false);
    expect(authStorage.has('ccs-email-link-requests')).toBe(false);
  });

  it('sends reset links without PKCE and leaves a pending OAuth verifier untouched', async () => {
    const { account, requests, authStorage } = setup();
    authStorage.set('ccs-auth-session-code-verifier', 'pending-oauth-verifier');
    await account.requestPasswordReset(' solver@example.test ');
    expect(requests).toHaveLength(1);
    expect(requests[0].url.pathname).toBe('/auth/v1/recover');
    expect(requests[0].url.searchParams.get('redirect_to')).toBe(`${configuration.appUrl}/?account=recovery`);
    expect(requests[0].body.email).toBe('solver@example.test');
    expect(requests[0].body.code_challenge).toBeNull();
    expect(requests[0].body.code_challenge_method).toBeNull();
    expect(authStorage.get('ccs-auth-session-code-verifier')).toBe('pending-oauth-verifier');
  });

  it('keeps provider authorization on PKCE while email requests use implicit links', async () => {
    const { account, requests, authStorage, intents } = setup();
    // Observe the actual SDK-generated authorize URL without replacing its implementation.
    const primary = (account as unknown as { client: SupabaseClient }).client;
    const authorize = vi.spyOn(primary.auth, 'signInWithOAuth');
    await account.signInWithProvider('google');
    const response = await authorize.mock.results[0].value;
    const redirect = new URL(response.data.url);
    expect(redirect.searchParams.get('provider')).toBe('google');
    expect(redirect.searchParams.get('code_challenge_method')).toBe('s256');
    expect(redirect.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(redirect.searchParams.get('redirect_to')).toBe(`${configuration.appUrl}/?account=signin`);
    expect(authStorage.get('ccs-auth-session-code-verifier')).toBeTruthy();
    expect(JSON.parse(intents.get('ccs-oauth-intent')!)).toMatchObject({ purpose: 'signin', provider: 'google' });
    expect(requests).toHaveLength(0);
  });

  it('consumes cross-browser email recovery and keeps later provider authorization on PKCE', async () => {
    const accessToken = `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.test-signature`;
    const callback = `${configuration.appUrl}/?account=recovery#access_token=${accessToken}&refresh_token=test-refresh&expires_in=3600&token_type=bearer&type=recovery`;
    const { account, authStorage, replaceState } = setup(callback);
    const events: string[] = [];
    const recoveryEvent = new Promise<void>(resolve => {
      account.subscribe((_session, event) => { events.push(event); if (event === 'PASSWORD_RECOVERY') resolve(); });
    });
    expect(await account.completeRedirect()).toBeNull();
    await recoveryEvent;
    expect(events).toContain('PASSWORD_RECOVERY');
    expect((await account.getSession())?.user.email).toBe('solver@example.test');
    expect(authStorage.has('ccs-auth-session-code-verifier')).toBe(false);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/');
    await account.signOut();
    const primary = (account as unknown as { client: SupabaseClient }).client;
    const authorize = vi.spyOn(primary.auth, 'signInWithOAuth');
    // Native navigation is a side effect; keep the actual SDK URL builder.
    Object.assign(window.location, { assign: vi.fn() });
    await account.signInWithProvider('google');
    const response = await authorize.mock.results[0].value;
    const providerUrl = new URL(response.data.url);
    expect(providerUrl.searchParams.get('code_challenge_method')).toBe('s256');
    expect(providerUrl.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(authStorage.get('ccs-auth-session-code-verifier')).toBeTruthy();
  });
});
