// Real production AccountAuth and SDK; browser tests supply synthetic API responses.
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { AccountAuth } from '../../src/cloud/auth';
const auth = new AccountAuth({ url: 'https://auth.example.test', publicKey: 'test-only-public-key', appUrl: location.origin, providers: 'google,wca' });
const events: Array<{ event: string; userId?: string }> = [];
auth.subscribe((session, event) => events.push({ event, userId: session?.user.id }));
await auth.completeRedirect();
await auth.getSession();
// Expose the actual SDK's public refreshSession for deterministic race tests;
// the production app normally lets its automatic refresh ticker invoke it.
const sdk = Reflect.get(auth, 'client') as SupabaseClient;
let refreshState: { complete: boolean; error?: string; userId?: string } = { complete: false };
let deletionLogoutState: { complete: boolean; error?: string } = { complete: false };
let passwordState: { complete: boolean; error?: string } = { complete: false };
let reauthState: { complete: boolean; error?: string; userId?: string } = { complete: false };
Object.assign(window, { accountLifecycleFixture: {
  events,
  session: () => auth.getSession(),
  signUp: (email: string) => auth.signUp(email, 'test-only-password'),
  signIn: (email: string) => auth.signIn(email, 'test-only-password'),
  signOut: () => auth.signOut(),
  startDeletionLogout(userId: string) {
    deletionLogoutState = { complete: false };
    void auth.signOutAfterDeletion(userId).then(() => { deletionLogoutState = { complete: true }; }).catch(error => { deletionLogoutState = { complete: true, error: error.name }; });
  },
  deletionLogoutState: () => deletionLogoutState,
  startPasswordUpdate(userId: string) {
    passwordState = { complete: false };
    void auth.updatePassword('test-only-new-password', userId).then(() => { passwordState = { complete: true }; }).catch(error => { passwordState = { complete: true, error: error.code }; });
  },
  passwordState: () => passwordState,
  startDeletionReauth(userId: string) {
    reauthState = { complete: false };
    void auth.reauthenticateForDeletion('test-only-password', userId).then(session => { reauthState = { complete: true, userId: session.user.id }; }).catch(error => { reauthState = { complete: true, error: error.code }; });
  },
  reauthState: () => reauthState,
  beginProviderSignIn() { void auth.signInWithProvider('google'); },
  startRefresh() {
    refreshState = { complete: false };
    void sdk.auth.refreshSession().then(({ data, error }) => {
      refreshState = { complete: true, ...(error ? { error: error.name } : {}), ...(data.session ? { userId: data.session.user.id } : {}) };
    }).catch(error => { refreshState = { complete: true, error: error.name }; });
  },
  refreshState: () => refreshState,
  refreshActive: () => Reflect.get(sdk.auth, 'autoRefreshTicker') != null,
  storedSession: (): Session | null => JSON.parse(localStorage.getItem('ccs-auth-session') ?? 'null'),
} });
document.getElementById('status')!.textContent = 'Account ready';
