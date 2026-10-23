import { captureAppleGrant } from '../../../src/cloud/apple-grant';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { CloudError, type AccountSession } from '../../../src/cloud/types';

export interface SessionStorage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> }
export type NativeProvider = 'google' | 'wca' | 'apple';
export type NativeAppleAuthorize = (nonce: string, state: string) => Promise<{ identityToken: string; authorizationCode: string; state: string } | null>;
export const CALLBACK_URL = 'cubingcompsim://auth/callback';
const INTENT_KEY = 'ccs-native-oauth-intent';
const INTENT_AGE = 10 * 60_000;
const providers = { google: 'google', wca: 'custom:wca', apple: 'apple' } as const;
interface Intent { state: string; provider: NativeProvider; startedAt: number }
export interface NativeAuthConfig { url?: string; publicKey?: string; providers?: string; webUrl?: string; apiUrl?: string }
export interface BrowserResult { type: string; url?: string }
export type OpenAuthBrowser = (url: string, redirect: string) => Promise<BrowserResult>;

export function sessionView(session: Session | null): AccountSession | null {
  return session ? { accessToken: session.access_token, user: {
    id: session.user.id, email: session.user.email ?? '', emailVerified: Boolean(session.user.email_confirmed_at),
    providers: [...new Set(session.user.identities?.map(identity => identity.provider) ?? [])],
  } } : null;
}
function validOrigin(input?: string): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash ? url.origin : null;
  } catch { return null; }
}
export function isPublicClientKey(key: string | undefined): boolean {
  if (!key) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  try {
    const payload = key.split('.')[1];
    // This only rejects a privileged configuration mistake. It grants no trust
    // to decoded claims; the SDK/server still verify actual session tokens.
    return typeof payload === 'string' && JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon';
  } catch { return false; }
}
export function parseCallback(url: string, pending: string | null, now = Date.now()): { code: string; flowId?: string; provider: NativeProvider } {
  if (!pending) throw new Error('No matching sign-in request.');
  const intent = JSON.parse(pending) as Intent;
  const parsed = new URL(url); const expected = new URL(CALLBACK_URL);
  if (parsed.protocol !== expected.protocol || parsed.hostname !== expected.hostname || parsed.pathname !== expected.pathname || parsed.hash
    || parsed.username || parsed.password || parsed.port || intent.provider === 'apple' || !Object.hasOwn(providers, intent.provider)
    || typeof intent.state !== 'string' || intent.state.length < 32 || parsed.searchParams.getAll('ccs_state').length !== 1
    || parsed.searchParams.get('ccs_state') !== intent.state || !Number.isSafeInteger(intent.startedAt)
    || intent.startedAt > now + 30_000 || intent.startedAt < now - INTENT_AGE || parsed.searchParams.has('error')
    || parsed.searchParams.getAll('code').length !== 1 || !parsed.searchParams.get('code') || parsed.searchParams.getAll('sb_flow_id').length > 1) {
    throw new Error('Sign-in callback is invalid or expired.');
  }
  return { code: parsed.searchParams.get('code')!, flowId: parsed.searchParams.get('sb_flow_id') ?? undefined, provider: intent.provider };
}

/** Auth deliberately has no history/storage-transfer dependency. All account
 * mutations are serialized, including a cold-start callback and browser result. */
export class NativeAccounts {
  readonly configured: boolean;
  readonly providers: NativeProvider[];
  private readonly client: SupabaseClient | null;
  private readonly emailClient: SupabaseClient | null;
  private readonly webUrl: string;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly config: NativeAuthConfig, private readonly storage: SessionStorage,
    private readonly uuid: () => string, private readonly browser: OpenAuthBrowser, client?: SupabaseClient, private readonly appleAuthorize?: NativeAppleAuthorize) {
    const url = validOrigin(config.url);
    this.webUrl = validOrigin(config.webUrl) ?? '';
    this.providers = [...new Set((config.providers ?? '').split(',').filter((p): p is NativeProvider => p === 'google' || p === 'wca' || (p === 'apple' && Boolean(appleAuthorize))))];
    this.configured = Boolean(url && this.webUrl && isPublicClientKey(config.publicKey));
    this.client = client ?? (this.configured ? createClient(url!, config.publicKey!, { auth: {
      storage, storageKey: 'ccs-native-session', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce',
    } }) : null);
    // Email confirmation/recovery is completed on the website, potentially on
    // another device. Do not bind those links to a native PKCE verifier.
    this.emailClient = client ?? (this.configured ? createClient(url!, config.publicKey!, { auth: {
      persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'implicit', storageKey: 'ccs-native-email-requests',
    } }) : null);
  }
  private sdk(): SupabaseClient {
    if (!this.client) throw new CloudError('not_configured', 'Accounts are not configured in this build. Guest practice remains available.');
    return this.client;
  }
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task); this.tail = result.catch(() => undefined); return result;
  }
  subscribe(listener: (session: AccountSession | null) => void): () => void {
    if (!this.client) return () => undefined;
    const { data } = this.client.auth.onAuthStateChange((_event, session) => listener(sessionView(session)));
    return () => data.subscription.unsubscribe();
  }
  async getSession(): Promise<AccountSession | null> {
    if (!this.client) return null;
    const { data, error } = await this.client.auth.getSession();
    if (error) throw new CloudError('auth_required', 'Could not restore the session. Sign in again.');
    return sessionView(data.session);
  }
  /** Check live identity before every cloud action, including after refresh. */
  async verifiedSession(): Promise<AccountSession> {
    const session = await this.getSession();
    if (!session) throw new CloudError('auth_required', 'Sign in to use cloud saves.');
    const { data, error } = await this.sdk().auth.getUser(session.accessToken);
    if (error || !data.user || data.user.id !== session.user.id) throw new CloudError('auth_required', 'The session expired or was revoked. Sign in again.');
    if (!data.user.email_confirmed_at) throw new CloudError('email_unverified', 'Verify your email before using cloud saves.');
    if ((await this.getSession())?.user.id !== session.user.id) throw new CloudError('auth_required', 'The account changed. Try again.');
    return session;
  }
  setActive(active: boolean): void {
    if (!this.client) return;
    void (active ? this.client.auth.startAutoRefresh() : this.client.auth.stopAutoRefresh());
  }
  signIn(email: string, password: string): Promise<void> { return this.serial(async () => {
    await this.storage.removeItem(INTENT_KEY);
    const { error, data } = await this.sdk().auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.session) throw new CloudError('auth_error', 'Could not sign in. Check your email, password and email verification.');
  }); }
  signUp(email: string, password: string): Promise<boolean> { return this.serial(async () => {
    await this.storage.removeItem(INTENT_KEY);
    this.sdk();
    const { data, error } = await this.emailClient!.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${this.webUrl}/` } });
    if (error) throw new CloudError('auth_error', 'Could not create an account. Please try again.');
    if (data.session && this.emailClient !== this.client) {
      const restored = await this.sdk().auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
      if (restored.error) throw new CloudError('auth_error', 'Could not restore your new account. Sign in again.');
    }
    return Boolean(data.session);
  }); }
  requestPasswordReset(email: string): Promise<void> { return this.serial(async () => {
    this.sdk();
    const { error } = await this.emailClient!.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${this.webUrl}/?account=recovery` });
    if (error) throw new CloudError('auth_error', 'Could not send the reset request. Try again later.');
  }); }
  signOut(): Promise<void> { return this.serial(async () => {
    await this.storage.removeItem(INTENT_KEY);
    const { error } = await this.sdk().auth.signOut({ scope: 'local' });
    if (error) throw new CloudError('auth_error', 'Could not sign out. Try again.');
  }); }
  async signInWithProvider(provider: NativeProvider): Promise<void> {
    if (provider === 'apple') return this.signInWithApple();
    const target = await this.serial(async () => {
      if (!this.providers.includes(provider)) throw new CloudError('not_configured', 'This provider is not enabled in this build.');
      if (await this.getSession()) throw new CloudError('auth_error', 'Sign out before changing accounts.');
      const previous = await this.storage.getItem(INTENT_KEY);
      if (previous) {
        let at = 0; try { at = JSON.parse(previous).startedAt; } catch { /* Replace a damaged intent. */ }
        if (Number.isSafeInteger(at) && at >= Date.now() - INTENT_AGE) throw new CloudError('auth_error', 'Finish or cancel the previous provider sign-in first.');
        await this.storage.removeItem(INTENT_KEY);
      }
      const intent: Intent = { provider, state: this.uuid(), startedAt: Date.now() };
      await this.storage.setItem(INTENT_KEY, JSON.stringify(intent));
      const redirectTo = `${CALLBACK_URL}?ccs_state=${encodeURIComponent(intent.state)}`;
      const { data, error } = await this.sdk().auth.signInWithOAuth({ provider: providers[provider], options: {
        redirectTo, skipBrowserRedirect: true, ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}),
      } });
      if (error || !data.url) { await this.storage.removeItem(INTENT_KEY); throw new CloudError('auth_error', 'Could not start provider sign-in.'); }
      const authorization = new URL(data.url);
      if (authorization.searchParams.get('code_challenge_method')?.toLowerCase() !== 's256'
        || !authorization.searchParams.get('code_challenge')) {
        await this.storage.removeItem(INTENT_KEY);
        throw new CloudError('auth_error', 'Secure provider sign-in is unavailable in this runtime. Use email sign-in.');
      }
      return { url: data.url, intent: JSON.stringify(intent) };
    });
    try {
      const result = await this.browser(target.url, CALLBACK_URL);
      if (result.type === 'success' && result.url) await this.handleCallback(result.url);
      else await this.serial(async () => { if (await this.storage.getItem(INTENT_KEY) === target.intent) await this.storage.removeItem(INTENT_KEY); });
    } catch (error) {
      await this.serial(async () => { if (await this.storage.getItem(INTENT_KEY) === target.intent) await this.storage.removeItem(INTENT_KEY); });
      throw error;
    }
  }
  private signInWithApple(): Promise<void> { return this.serial(async () => {
    if (!this.providers.includes('apple') || !this.appleAuthorize) throw new CloudError('not_configured', 'Apple sign-in is unavailable.');
    if (await this.getSession()) throw new CloudError('auth_error', 'Sign out before changing accounts.');
    await this.storage.removeItem(INTENT_KEY);
    const nonce = this.uuid() + this.uuid();
    const state = this.uuid();
    const credential = await this.appleAuthorize(nonce, state);
    if (!credential) return;
    if (credential.state !== state || !credential.identityToken || !credential.authorizationCode)
      throw new CloudError('auth_error', 'Apple sign-in could not be verified.');
    const { data, error } = await this.sdk().auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce });
    if (error || !data.session || !data.session.user.identities?.some(identity => identity.provider === 'apple'))
      throw new CloudError('auth_error', 'Apple sign-in could not be verified.');
    try {
      await captureAppleGrant(this.config.apiUrl, data.session.access_token, {
        clientId: 'com.cubingcompsim.app', code: credential.authorizationCode,
      });
    } catch (error) {
      await this.sdk().auth.signOut({ scope: 'local' });
      await this.storage.removeItem('ccs-native-session');
      throw error;
    }
  }); }
  handleCallback(url: string): Promise<void> { return this.serial(async () => {
    if (!url.startsWith(`${CALLBACK_URL}?`)) return;
    const pending = await this.storage.getItem(INTENT_KEY);
    // Browser completion and Linking may both deliver the same one-use URL.
    if (!pending) return;
    await this.storage.removeItem(INTENT_KEY);
    try {
      const callback = parseCallback(url, pending);
      const { data, error } = await this.sdk().auth.exchangeCodeForSession(callback.code, callback.flowId ? { flowId: callback.flowId } : undefined);
      if (error || !data.session || !data.session.user.identities?.some(identity => identity.provider === providers[callback.provider])) {
        await this.sdk().auth.signOut({ scope: 'local' });
        await this.storage.removeItem('ccs-native-session');
        throw new Error('Provider exchange failed.');
      }
    } catch { throw new CloudError('auth_error', 'Sign-in expired, was cancelled or could not be verified. Please start again.'); }
  }); }
  /** A separate client proves the password without replacing the current session. */
  deleteWithPassword(password: string, expectedUserId: string, remove: (session: AccountSession) => Promise<{ status: 'deleted' | 'pending' }>): Promise<'deleted' | 'pending'> {
    return this.serial(async () => {
      const session = await this.verifiedSession();
      if (session.user.id !== expectedUserId) throw new CloudError('auth_required', 'The account changed. Nothing was deleted.');
      if (!session.user.providers?.includes('email')) throw new CloudError('reauth_required', 'Use the website to confirm your connected provider before deletion.');
      const isolated = createClient(this.config.url!, this.config.publicKey!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      try {
        const { data, error } = await isolated.auth.signInWithPassword({ email: session.user.email, password });
        if (error || !data.session || data.session.user.id !== expectedUserId) throw new CloudError('reauth_required', 'Could not confirm this account. Check your password.');
        const result = await remove(sessionView(data.session)!);
        // The operation queue prevents sign-in from overtaking deletion cleanup.
        await this.sdk().auth.signOut({ scope: 'local' });
        await this.storage.removeItem('ccs-native-session');
        return result.status;
      } finally { isolated.auth.dispose(); }
    });
  }
  dispose(): void { this.client?.auth.dispose(); if (this.emailClient !== this.client) this.emailClient?.auth.dispose(); }
}
