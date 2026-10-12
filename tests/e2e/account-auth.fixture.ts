// Real SDK callback initialization with synthetic provider responses supplied by Playwright.
import { AccountAuth } from '../../src/cloud/auth';
const auth = new AccountAuth({ url: 'https://auth.example.test', publicKey: 'test-only-public-key', appUrl: location.origin, providers: 'google,wca' });
const callback = await auth.completeRedirect();
const session = await auth.getSession();
let deletionAllowed = false;
try { await auth.reauthenticatedDeletionSession(); deletionAllowed = true; } catch { /* Expected without valid same-account proof. */ }
Object.assign(window, { realAccountFixture: { callback, session, deletionAllowed, storedSession: localStorage.getItem('ccs-auth-session'), intent: sessionStorage.getItem('ccs-oauth-intent') } });
document.getElementById('status')!.textContent = 'Callback complete';
