// Browser-only fixture: exercise the real dialog without live provider accounts.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AccountDialog } from '../../src/ui/AccountDialog';
import { auth, cloud, CloudError, accountFixtureSdkConfigured, type AccountCallback, type AccountSession } from './account-cloud.fixture';
import '../../src/styles/app.css';

const calls: Array<{ method: string; provider?: string; userId?: string }> = [];
let failProvider = false;
let failProof = false;
let mismatch = false;
let currentSession: AccountSession | null = null;
let withSave = false;
let switchDuringDownload = false;
let holdDeletion = false;
let deletionStarted = false;
let releaseDeletion: (() => void) | undefined;
let holdPasswordReauth = false;
let passwordReauthStarted = false;
let releasePasswordReauth: (() => void) | undefined;
Object.defineProperty(auth, 'providers', { value: ['google', 'wca'], configurable: true });
for (const method of ['signInWithProvider', 'linkProvider', 'reauthenticateWithProvider'] as const) {
  auth[method] = async provider => { calls.push({ method, provider }); if (failProvider) throw new Error('Provider denied'); };
}
const session = (providers: string[]): AccountSession => ({ accessToken: 'test-only-token', user: { id: 'test-only-user', email: 'solver@example.test', emailVerified: true, providers } });
auth.getSession = async () => currentSession;
auth.updatePassword = async (_password, expectedUserId) => { calls.push({ method: 'updatePassword', userId: expectedUserId }); if (currentSession?.user.id !== expectedUserId) throw new CloudError('auth_required', 'Account changed'); };
const fresh = (providers: string[]) => { const value = session(providers); if (mismatch) value.user.id = 'different-user'; return value; };
auth.reauthenticatedDeletionSession = async () => { calls.push({ method: 'reauthenticatedDeletionSession' }); if (failProof) throw new CloudError('reauth_required', 'Expired'); return fresh(['google']); };
auth.reauthenticateForDeletion = async () => { calls.push({ method: 'reauthenticateForDeletion' }); passwordReauthStarted = true; if (holdPasswordReauth) await new Promise<void>(resolve => { releasePasswordReauth = resolve; }); return fresh(['email']); };
auth.signOutAfterDeletion = async () => { calls.push({ method: 'signOutAfterDeletion' }); };
const metadata = { revision: 1, savedAt: new Date().toISOString(), roundCount: 0, attemptCount: 0, bytes: 100, sha256: '0'.repeat(64) };
cloud.getSaveMetadata = async target => withSave ? { ...metadata, roundCount: target.user.id === 'different-user' ? 7 : 0 } : null;
cloud.download = async () => { calls.push({ method: 'downloadCloud' }); if (switchDuringDownload && currentSession) currentSession = { ...currentSession, user: { ...currentSession.user, id: 'different-user' } }; return { snapshot: { app: 'cubing-comp-sim', schemaVersion: 1, exportedAt: Date.now(), rounds: [], activeRoundId: null }, metadata }; };
cloud.upload = async () => { calls.push({ method: 'uploadCloud' }); return metadata; };
cloud.deleteAccount = async () => { calls.push({ method: 'deleteAccount' }); deletionStarted = true; if (holdDeletion) await new Promise<void>(resolve => { releaseDeletion = resolve; }); return { status: 'deleted' }; };
function Fixture() {
  const [state, setState] = useState<{ revision: number; session: AccountSession | null; callback: AccountCallback | null; recovery: boolean }>({ revision: 0, session: null, callback: null, recovery: false });
  Object.assign(window, { accountFixture: {
    calls,
    sdkConfigured: accountFixtureSdkConfigured,
    render(providers: string[] | null, callback: AccountCallback | null = null, wcaId?: string) { calls.length = 0; failProvider = false; failProof = false; mismatch = false; switchDuringDownload = false; holdDeletion = false; deletionStarted = false; holdPasswordReauth = false; passwordReauthStarted = false; currentSession = providers ? session(providers) : null; if (currentSession && wcaId) currentSession.user.wcaId = wcaId; const revision = state.revision + 1; setState({ revision, session: currentSession, callback, recovery: false }); return revision; },
    renderRecovery() { calls.length = 0; currentSession = session(['email']); const revision = state.revision + 1; setState({ revision, session: currentSession, callback: null, recovery: true }); return revision; },
    failProvider() { failProvider = true; },
    failProof() { failProof = true; },
    mismatch() { mismatch = true; },
    withSave() { withSave = true; },
    holdDeletion() { holdDeletion = true; },
    deletionStarted: () => deletionStarted,
    releaseDeletion() { releaseDeletion?.(); },
    holdPasswordReauth() { holdPasswordReauth = true; },
    passwordReauthStarted: () => passwordReauthStarted,
    releasePasswordReauth() { releasePasswordReauth?.(); },
    switchAuthUser() { if (currentSession) currentSession = { ...currentSession, user: { ...currentSession.user, id: 'different-user' } }; },
    switchDisplayedUser() { if (currentSession) { currentSession = { ...currentSession, user: { ...currentSession.user, id: 'different-user', email: 'different@example.test' } }; setState({ ...state, session: currentSession }); } },
    switchDuringDownload() { switchDuringDownload = true; },
    refreshToken() { if (currentSession) { currentSession = { ...currentSession, accessToken: 'fresh-test-token' }; setState({ ...state, session: currentSession }); } },
    providers(providers: string[]) { Object.defineProperty(auth, 'providers', { value: providers, configurable: true }); },
  } });
  return <div data-account-fixture-revision={state.revision}><AccountDialog key={state.revision} session={state.session} callback={state.callback} recovery={state.recovery} onRecoveryComplete={() => { calls.push({ method: 'recoveryComplete' }); setState(current => ({ ...current, recovery: false })); }} onClose={() => undefined} localRevision={1} onExport={async () => { calls.push({ method: 'exportHistory' }); return JSON.stringify({ app: 'cubing-comp-sim', schemaVersion: 1, exportedAt: Date.now(), rounds: [], activeRoundId: null }); }} onReplace={async () => { calls.push({ method: 'replaceHistory' }); }} /></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
