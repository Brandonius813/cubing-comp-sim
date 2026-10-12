import { createClient, type Session, type SupabaseClient, type AuthChangeEvent } from '@supabase/supabase-js';
import { CloudError, type AccountSession, type AccountProvider, type AccountCallback } from './types';

export type AccountListener = (session: AccountSession | null, event: AuthChangeEvent) => void;
export interface AuthConfiguration { url?: string; publicKey?: string; appUrl?: string; providers?: string }

const INTENT_KEY = 'ccs-oauth-intent';
const AUTH_STORAGE_KEY = 'ccs-auth-session';
const MAX_REDIRECT_AGE = 10 * 60_000;
const PROVIDERS = { google: 'google', wca: 'custom:wca' } as const;
interface RedirectIntent { purpose: AccountCallback['purpose']; provider: AccountProvider; userId?: string; startedAt: number }
const credentialKeys = ['code', 'sb_flow_id', 'error', 'error_code', 'error_description', 'access_token', 'refresh_token', 'provider_token', 'provider_refresh_token', 'expires_at', 'expires_in', 'token_type', 'type'];

/** Third-party API tokens are unnecessary for this app. Never persist them. */
export function withoutProviderTokens(value: string): string {
  try {
    const session = JSON.parse(value);
    if (session && typeof session === 'object' && 'access_token' in session) {
      delete session.provider_token; delete session.provider_refresh_token;
      return JSON.stringify(session);
    }
  } catch { /* PKCE verifiers are strings, not sessions. */ }
  return value;
}

function mapSession(session: Session | null): AccountSession | null {
  return session ? {
    accessToken: session.access_token,
    user: {
      id: session.user.id,
      email: session.user.email ?? '',
      emailVerified: Boolean(session.user.email_confirmed_at),
      providers: [...new Set(session.user.identities?.map(identity => identity.provider) ?? [])],
    },
  } : null;
}

/** Authentication has no dependency on local history and cannot transfer it. */
export class AccountAuth {
  readonly configured: boolean;
  readonly providers: readonly AccountProvider[];
  private client: SupabaseClient | null;
  private emailClient: SupabaseClient | null;
  private emailCallbackClient: SupabaseClient | null;
  private readonly createIsolatedClient?: () => SupabaseClient;
  private readonly listeners = new Set<AccountListener>();
  private storageListener?: (event: StorageEvent) => void;
  private readonly redirectBase: string;
  private readonly initialUrl: URL | null;
  private redirectCompletion?: Promise<AccountCallback | null>;
  private deletionProof?: { userId: string; at: number };

  constructor(config: AuthConfiguration, client?: SupabaseClient) {
    this.initialUrl = typeof location === 'undefined' ? null : new URL(location.href);
    this.providers = [...new Set((config.providers ?? '').split(',').filter((provider): provider is AccountProvider => provider === 'google' || provider === 'wca'))];
    this.redirectBase = typeof location === 'undefined' ? 'http://localhost:5173' : location.origin;
    try {
      const base = new URL(config.appUrl || this.redirectBase);
      if ((base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('Use a fixed app origin for account redirects.');
      this.redirectBase = base.origin;
      this.client = client ?? (config.url && config.publicKey ? createClient(config.url, config.publicKey, {
        // Exchange provider codes explicitly after checking the local intent.
        // Otherwise SDK initialization could consume an unrelated callback or
        // quietly restore an old session when its verifier is missing.
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'ccs-auth-session',
          flowType: 'pkce',
          ...(typeof localStorage === 'undefined' ? {} : { storage: {
            getItem: (key: string) => localStorage.getItem(key),
            setItem: (key: string, value: string) => localStorage.setItem(key, key === 'ccs-auth-session' ? withoutProviderTokens(value) : value),
            removeItem: (key: string) => localStorage.removeItem(key),
          } }),
        },
      }) : null);
      // Email links can be opened on another device. Their request client does
      // not issue a browser-bound PKCE verifier or keep a second login session.
      this.emailClient = client ?? (config.url && config.publicKey ? createClient(config.url, config.publicKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'implicit', storageKey: 'ccs-email-link-requests' },
      }) : null);
      if (config.url && config.publicKey) {
        const url = config.url; const publicKey = config.publicKey;
        this.createIsolatedClient = () => createClient(url, publicKey, { auth: {
          persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
          storageKey: `ccs-account-operation-${crypto.randomUUID()}`,
        } });
      }
      // Consume cross-browser email links independently so the primary client
      // stays on PKCE even when a user starts OAuth after completing recovery.
      const emailHash = new URLSearchParams(this.initialUrl?.hash.slice(1));
      const emailCallback = emailHash.has('access_token') && !this.initialUrl?.searchParams.has('code')
        && !['signin', 'link', 'delete'].includes(this.initialUrl?.searchParams.get('account') ?? '')
        && ['signup', 'recovery', 'email', 'email_change', 'magiclink', 'invite'].includes(emailHash.get('type') ?? '');
      this.emailCallbackClient = !client && config.url && config.publicKey && emailCallback
        ? createClient(config.url, config.publicKey, { auth: { persistSession: false, autoRefreshToken: false,
          detectSessionInUrl: true, flowType: 'implicit', storageKey: 'ccs-email-link-callback' } }) : null;
    } catch {
      // A mistyped deployment setting must never stop guest/offline practice.
      this.client = null;
      this.emailClient = null;
      this.emailCallbackClient = null;
    }
    this.configured = this.client !== null;
  }

  /** Await SDK credential consumption before telemetry or callback UI starts. */
  completeRedirect(): Promise<AccountCallback | null> {
    return this.redirectCompletion ??= this.finishRedirect();
  }

  private async finishRedirect(): Promise<AccountCallback | null> {
    const url = this.initialUrl;
    const hash = new URLSearchParams(url?.hash.slice(1));
    const isCallback = Boolean(url && (credentialKeys.some(key => url.searchParams.has(key) || hash.has(key)) || ['signin', 'link', 'delete', 'recovery'].includes(url.searchParams.get('account') ?? '')));
    let intent: RedirectIntent | undefined;
    if (isCallback && typeof sessionStorage !== 'undefined') {
      try {
        const value = JSON.parse(sessionStorage.getItem(INTENT_KEY) ?? 'null');
        if (value && ['signin', 'link', 'delete'].includes(value.purpose) && ['google', 'wca'].includes(value.provider)
          && Number.isFinite(value.startedAt) && value.startedAt <= Date.now() && value.startedAt >= Date.now() - MAX_REDIRECT_AGE
          && (value.purpose === 'signin' || typeof value.userId === 'string')) intent = value;
      } catch { /* Invalid or unavailable intent fails closed. */ }
      finally { try { sessionStorage.removeItem(INTENT_KEY); } catch { /* No persistence needed. */ } }
    }
    try {
      if (hash.has('access_token') && (intent || url?.searchParams.has('code') || ['signin', 'link', 'delete'].includes(url?.searchParams.get('account') ?? ''))) {
        throw new Error('Mixed callback credentials');
      }
      if (this.emailCallbackClient) {
        const emailInitialized = await this.emailCallbackClient.auth.initialize();
        const emailSession = await this.emailCallbackClient.auth.getSession();
        if (emailInitialized.error || emailSession.error || !emailSession.data.session) throw new Error('Email callback failed');
        const restored = await this.sdk().auth.setSession({ access_token: emailSession.data.session.access_token, refresh_token: emailSession.data.session.refresh_token });
        if (restored.error || !restored.data.session) throw new Error('Email session restore failed');
        if (hash.get('type') === 'recovery') {
          for (const listener of this.listeners) listener(mapSession(restored.data.session), 'PASSWORD_RECOVERY');
        }
      }
      const initialized = await this.client?.auth.initialize();
      if (initialized?.error || ['error', 'error_code', 'error_description'].some(key => url?.searchParams.has(key) || hash.has(key))) throw new Error('Callback failed');
      if (!isCallback || !intent) return isCallback && (url?.searchParams.has('code') || ['signin', 'link', 'delete'].includes(url?.searchParams.get('account') ?? '')) ? { purpose: 'signin', status: 'error' } : null;
      if (!url?.searchParams.get('code') || url.searchParams.get('account') !== intent.purpose) throw new Error('Missing OAuth exchange');
      const flowId = url.searchParams.get('sb_flow_id');
      // The supported SDK exchange checks legacy/per-flow verifier storage and
      // rejects invalid flow IDs. Do not infer success from a cached session.
      const exchanged = await this.sdk().auth.exchangeCodeForSession(url.searchParams.get('code')!,
        flowId === null ? undefined : { flowId });
      if (exchanged.error || !exchanged.data.session) throw new Error('OAuth exchange failed');
      const session = await this.getSession();
      if (!session || session.user.id !== exchanged.data.session.user.id || (intent.userId && session.user.id !== intent.userId)
        || !session.user.providers?.includes(PROVIDERS[intent.provider])) throw new Error('Account mismatch');
      if (intent.purpose === 'delete') this.deletionProof = { userId: session.user.id, at: intent.startedAt };
      return { purpose: intent.purpose, provider: intent.provider, status: 'success' };
    } catch {
      const needsEmail = url?.searchParams.get('error_code') === 'provider_email_needs_verification' || hash.get('error_code') === 'provider_email_needs_verification';
      return isCallback ? { purpose: intent?.purpose ?? 'signin', provider: intent?.provider, status: 'error', ...(needsEmail ? { reason: 'email_verification' as const } : {}) } : null;
    } finally {
      // This one-shot client only consumes an email link. Release its SDK
      // listeners and in-memory session after restoring the primary client.
      this.emailCallbackClient?.auth.dispose();
      this.emailCallbackClient = null;
      if (isCallback && typeof window !== 'undefined') {
        const clean = new URL(window.location.href);
        credentialKeys.forEach(key => clean.searchParams.delete(key));
        clean.searchParams.delete('account');
        if (credentialKeys.some(key => hash.has(key))) clean.hash = '';
        window.history.replaceState(window.history.state, '', clean.pathname + clean.search + clean.hash);
      }
    }
  }

  private async redirect(provider: AccountProvider, purpose: AccountCallback['purpose'], expectedUserId?: string): Promise<void> {
    if (!this.providers.includes(provider)) throw new CloudError('not_configured', 'This sign-in method is not available yet.');
    const client = this.sdk();
    const current = await this.getSession();
    if (expectedUserId && current?.user.id !== expectedUserId) throw new CloudError('auth_required', 'The account changed. Open account settings again.');
    if (purpose !== 'signin' && !current) throw new CloudError('auth_required', 'Sign in before linking or confirming an identity.');
    if (purpose === 'delete' && !current?.user.providers?.includes(PROVIDERS[provider])) throw new CloudError('auth_required', 'Use a connected identity.');
    if (purpose === 'signin' && current) throw new CloudError('auth_error', 'Sign out before using another sign-in method.');
    if (typeof sessionStorage === 'undefined') throw new CloudError('auth_error', 'Browser storage is required for sign-in.');
    const intent: RedirectIntent = { purpose, provider, startedAt: Date.now(), ...(current ? { userId: current.user.id } : {}) };
    try {
      sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
      const options = { redirectTo: `${this.redirectBase}/?account=${purpose}`, ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}) };
      const result = purpose === 'link' ? await client.auth.linkIdentity({ provider: PROVIDERS[provider], options })
        : await client.auth.signInWithOAuth({ provider: PROVIDERS[provider], options });
      if (result.error) throw result.error;
    } catch {
      sessionStorage.removeItem(INTENT_KEY);
      throw new CloudError('auth_error', 'Could not start provider sign-in. Please try again.');
    }
  }

  signInWithProvider(provider: AccountProvider): Promise<void> { return this.redirect(provider, 'signin'); }
  linkProvider(provider: AccountProvider, expectedUserId?: string): Promise<void> { return this.redirect(provider, 'link', expectedUserId); }
  reauthenticateWithProvider(provider: AccountProvider, expectedUserId?: string): Promise<void> { return this.redirect(provider, 'delete', expectedUserId); }

  async reauthenticatedDeletionSession(): Promise<AccountSession> {
    const session = await this.getSession();
    if (!session || this.deletionProof?.userId !== session.user.id || this.deletionProof.at < Date.now() - 5 * 60_000) {
      throw new CloudError('reauth_required', 'Confirm your identity again before deleting your account.');
    }
    return session;
  }

  private sdk(): SupabaseClient {
    if (!this.client) throw new CloudError('not_configured', 'Accounts are not configured yet. Your times are saved on this device.');
    return this.client;
  }

  async getSession(): Promise<AccountSession | null> {
    if (!this.client) return null;
    const { data, error } = await this.client.auth.getSession();
    if (error) throw new CloudError('auth_error', 'Could not restore your account session. Try signing in again.');
    return mapSession(data.session);
  }

  subscribe(listener: AccountListener): () => void {
    if (!this.client) return () => undefined;
    this.listeners.add(listener);
    if (!this.storageListener && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      // Deletion cleanup deliberately avoids SDK signOut's broad cache removal.
      // Native storage events synchronize its guarded removal with other tabs.
      this.storageListener = event => {
        if (event.key !== AUTH_STORAGE_KEY || event.newValue !== null || typeof localStorage === 'undefined') return;
        try {
          // A newer sign-in may have overtaken this queued removal event.
          if (localStorage.getItem(AUTH_STORAGE_KEY) !== null) return;
          this.deletionProof = undefined;
          for (const subscribed of this.listeners) subscribed(null, 'SIGNED_OUT');
        } catch { /* Storage becoming unavailable must not affect guest use. */ }
      };
      window.addEventListener('storage', this.storageListener);
    }
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      // Supabase consumes its callback credentials before emitting this event.
      // Never put asynchronous SDK calls inside this synchronous callback.
      listener(mapSession(session), event);
    });
    return () => {
      this.listeners.delete(listener); data.subscription.unsubscribe();
      if (!this.listeners.size && this.storageListener && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('storage', this.storageListener);
        this.storageListener = undefined;
      }
    };
  }

  async signUp(email: string, password: string): Promise<AccountSession | null> {
    this.sdk();
    const { data, error } = await this.emailClient!.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${this.redirectBase}/` } });
    if (error) throw new CloudError('auth_error', error.message);
    if (data.session && this.emailClient !== this.client) {
      const restored = await this.sdk().auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
      if (restored.error) throw new CloudError('auth_error', 'Could not restore your new account session.');
    }
    return mapSession(data.session);
  }

  async signIn(email: string, password: string): Promise<AccountSession> {
    const { data, error } = await this.sdk().auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.session) throw new CloudError('auth_error', 'Could not sign in. Check your email and password, and verify your email if needed.');
    // A prior account deletion may have stopped refresh while clearing its cache.
    await this.sdk().auth.startAutoRefresh();
    return mapSession(data.session)!;
  }

  async signOut(): Promise<void> {
    const { error } = await this.sdk().auth.signOut({ scope: 'local' });
    if (error) throw new CloudError('auth_error', 'Could not sign out. Please try again.');
    this.deletionProof = undefined;
  }

  async reauthenticateForDeletion(password: string, expectedUserId?: string): Promise<AccountSession> {
    const current = await this.getSession();
    if (!current?.user.email) throw new CloudError('auth_required', 'Sign in before deleting your account.');
    if (expectedUserId && current.user.id !== expectedUserId) throw new CloudError('auth_required', 'The account changed. Open account settings again.');
    if (!this.createIsolatedClient) throw new CloudError('not_configured', 'Account confirmation is not configured.');
    const isolated = this.createIsolatedClient();
    let proof: Session | null = null;
    let accepted = false;
    try {
      // This credential check must not install A's fresh response over a newer
      // B session. Its fresh token is returned only for the deletion request.
      const { data, error } = await isolated.auth.signInWithPassword({ email: current.user.email, password });
      proof = data.session;
      if (error || !proof) throw new CloudError('auth_error', 'Could not confirm your account. Check your password.');
      if (proof.user.id !== current.user.id || (await this.getSession())?.user.id !== current.user.id) {
        throw new CloudError('auth_required', 'The account changed. Sign in again before deleting it.');
      }
      accepted = true;
      return mapSession(proof)!;
    } finally {
      // A proof rejected after a switch is not needed. Revoke that new session
      // alone; never let the primary client's current user choose its target.
      if (proof && !accepted) {
        try { await isolated.auth.admin.signOut(proof.access_token, 'local'); } catch { /* Best effort. */ }
      }
      isolated.auth.dispose();
    }
  }

  async signOutAfterDeletion(expectedUserId?: string): Promise<void> {
    const captured = await this.getSession();
    // A deletion response for account A must not revoke account B's session.
    if (expectedUserId && captured?.user.id !== expectedUserId) return;
    const client = this.sdk();
    try {
      // Public admin.signOut targets exactly this token and leaves browser
      // storage alone. Ordinary signOut clears whichever session is current
      // after its network response, which could now belong to another account.
      if (captured) await client.auth.admin.signOut(captured.accessToken, 'local');
    } catch { /* The identity may already be gone; local cleanup is still needed. */ }
    finally {
      const current = await this.getSession().catch(() => null);
      if (current && current.user.id !== captured?.user.id) return;
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (raw !== null) {
          let storedUserId: unknown;
          try { storedUserId = JSON.parse(raw)?.user?.id; }
          catch { return; } // Never clear an unidentified or newer credential cache.
          if (!captured || storedUserId !== captured.user.id) return;
          // Recheck shared credentials immediately before local cleanup.
          // Keep pending PKCE slots for other tabs intact.
          localStorage.removeItem(AUTH_STORAGE_KEY);
        }
      }
      this.deletionProof = undefined;
      for (const listener of this.listeners) listener(null, 'SIGNED_OUT');
      await client.auth.stopAutoRefresh();
      // A new sign-in may complete while stopping the old account's ticker.
      const replacement = await this.getSession().catch(() => null);
      if (replacement && replacement.user.id !== captured?.user.id) await client.auth.startAutoRefresh();
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    this.sdk();
    const { error } = await this.emailClient!.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${this.redirectBase}/?account=recovery` });
    // Never distinguish an existing account from an unknown address.
    if (error && (error.status === 429 || !error.status || error.status >= 500)) {
      throw new CloudError(error.status === 429 ? 'rate_limited' : 'network_error', 'Could not send the request. Wait a moment and try again.');
    }
  }

  async updatePassword(password: string, expectedUserId?: string): Promise<void> {
    const { data, error } = await this.sdk().auth.getSession();
    const captured = data.session;
    if (error || !captured || (expectedUserId && captured.user.id !== expectedUserId)) {
      throw new CloudError('auth_required', 'The account changed. Open account settings again.');
    }
    if (!this.createIsolatedClient) throw new CloudError('not_configured', 'Password updates are not configured.');
    const isolated = this.createIsolatedClient();
    try {
      // updateUser writes its response into its client's session. Isolate that
      // write so a delayed account-A response cannot overwrite account B's
      // shared browser credentials after a cross-tab switch.
      const restored = await isolated.auth.setSession({ access_token: captured.access_token, refresh_token: captured.refresh_token });
      if (restored.error || restored.data.session?.user.id !== captured.user.id) {
        throw new CloudError('auth_required', 'Could not verify the account for this password update.');
      }
      if ((await this.getSession())?.user.id !== captured.user.id) {
        throw new CloudError('auth_required', 'The account changed. Open account settings again.');
      }
      const updated = await isolated.auth.updateUser({ password });
      if (updated.error) throw new CloudError('auth_error', updated.error.message);
      if (updated.data.user?.id !== captured.user.id) throw new CloudError('auth_required', 'The account changed. Open account settings again.');
      // Revoke other sessions using only the verified account-A token. Never
      // let the current browser's possibly-new account choose the target.
      const { error: signOutError } = await isolated.auth.admin.signOut(restored.data.session.access_token, 'others');
      if (signOutError) throw new CloudError('auth_error', 'Password changed, but other sessions could not be signed out. Try again from account settings.');
      if ((await this.getSession())?.user.id !== captured.user.id) {
        throw new CloudError('auth_required', 'Password changed for the original account. The active account changed; open account settings again.');
      }
    } finally { isolated.auth.dispose(); }
  }
}
