import { createClient, type Session, type SupabaseClient, type AuthChangeEvent } from '@supabase/supabase-js';
import { CloudError, type AccountSession } from './types';

export type AccountListener = (session: AccountSession | null, event: AuthChangeEvent) => void;
export interface AuthConfiguration { url?: string; publicKey?: string; appUrl?: string }

function mapSession(session: Session | null): AccountSession | null {
  return session ? {
    accessToken: session.access_token,
    user: {
      id: session.user.id,
      email: session.user.email ?? '',
      emailVerified: Boolean(session.user.email_confirmed_at),
    },
  } : null;
}

/** Authentication has no dependency on local history and cannot transfer it. */
export class AccountAuth {
  readonly configured: boolean;
  private client: SupabaseClient | null;
  private readonly redirectBase: string;

  constructor(config: AuthConfiguration, client?: SupabaseClient) {
    this.redirectBase = (config.appUrl || (typeof location === 'undefined' ? 'http://localhost:5173' : location.origin)).replace(/\/$/, '');
    try {
      this.client = client ?? (config.url && config.publicKey ? createClient(config.url, config.publicKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'ccs-auth-session' },
      }) : null);
    } catch {
      // A mistyped deployment setting must never stop guest/offline practice.
      this.client = null;
    }
    this.configured = this.client !== null;
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
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      // Supabase consumes its callback credentials before emitting this event.
      // Never put asynchronous SDK calls inside this synchronous callback.
      listener(mapSession(session), event);
    });
    return () => data.subscription.unsubscribe();
  }

  async signUp(email: string, password: string): Promise<AccountSession | null> {
    const { data, error } = await this.sdk().auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${this.redirectBase}/` } });
    if (error) throw new CloudError('auth_error', error.message);
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
  }

  async reauthenticateForDeletion(password: string): Promise<AccountSession> {
    const current = await this.getSession();
    if (!current?.user.email) throw new CloudError('auth_required', 'Sign in before deleting your account.');
    const session = await this.signIn(current.user.email, password);
    if (session.user.id !== current.user.id) throw new CloudError('auth_required', 'The account changed. Sign in again before deleting it.');
    return session;
  }

  async signOutAfterDeletion(): Promise<void> {
    const client = this.sdk();
    try { await client.auth.signOut({ scope: 'local' }); }
    finally {
      await client.auth.stopAutoRefresh();
      // Auth deletion can make the provider reject logout, or its response can
      // be lost. Remove only the auth credential cache, never history/settings.
      if (typeof localStorage !== 'undefined') localStorage.removeItem('ccs-auth-session');
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await this.sdk().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${this.redirectBase}/?account=recovery` });
    // Never distinguish an existing account from an unknown address.
    if (error && (error.status === 429 || !error.status || error.status >= 500)) {
      throw new CloudError(error.status === 429 ? 'rate_limited' : 'network_error', 'Could not send the request. Wait a moment and try again.');
    }
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await this.sdk().auth.updateUser({ password });
    if (error) throw new CloudError('auth_error', error.message);
    // Revokes refresh sessions on other devices. Existing short-lived access
    // tokens may remain valid until expiry; the UI must not claim instant expiry.
    const { error: signOutError } = await this.sdk().auth.signOut({ scope: 'others' });
    if (signOutError) throw new CloudError('auth_error', 'Password changed, but other sessions could not be signed out. Try again from account settings.');
  }
}
