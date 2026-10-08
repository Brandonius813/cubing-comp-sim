import { useEffect, useRef, useState, type FormEvent } from 'react';
import { auth, cloud, cloudConfigured, cloudConfigurationMessage, type AccountSession, type SaveMetadata } from '../cloud';
import { parseHistoryJson, type HistorySnapshot } from '../storage';
import { telemetry } from '../telemetry';
import { Dialog } from './primitives';

export function AccountDialog({ session, recovery, onClose, onExport, onReplace, localRevision }: {
  session: AccountSession | null; recovery: boolean; onClose: () => void;
  onExport: () => Promise<string>; onReplace: (json: string, expectedRevision: number) => Promise<unknown>; localRevision: number;
}) {
  const [mode, setMode] = useState<'signIn' | 'signUp' | 'reset' | 'password'>(recovery ? 'password' : 'signIn');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [metadata, setMetadata] = useState<SaveMetadata | null>(null);
  const [metadataLoaded, setMetadataLoaded] = useState(false);
  const [transfer, setTransfer] = useState<'upload' | 'download' | null>(null);
  const [transferRevision, setTransferRevision] = useState(0);
  const pendingUpload = useRef<{ snapshot: HistorySnapshot; revision: number; operationId: string } | null>(null);
  const requestBusy = useRef(false);
  const action = async (work: () => Promise<void>) => { if (requestBusy.current) return; requestBusy.current = true; setBusy(true); setError(''); setMessage(''); try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The request could not be completed.'); } finally { requestBusy.current = false; setBusy(false); } };
  useEffect(() => { if (recovery) setMode('password'); }, [recovery]);
  useEffect(() => {
    if (!session || !cloudConfigured) return;
    let mounted = true;
    cloud.getSaveMetadata(session).then(result => { if (mounted) { setMetadata(result); setMetadataLoaded(true); } }).catch(cause => { if (mounted) setError(cause instanceof Error ? cause.message : 'Cloud save could not be checked.'); });
    return () => { mounted = false; };
  }, [session]);
  const submit = (event: FormEvent) => { event.preventDefault(); void action(async () => {
    if (mode === 'reset') { await auth.requestPasswordReset(email); setMessage('If an account uses that email, you will receive a password reset link.'); }
    else if (mode === 'password') { await auth.updatePassword(password); setPassword(''); setMessage('Password updated.'); setMode('signIn'); }
    else if (mode === 'signUp') { await auth.signUp(email, password); setPassword(''); setMessage('Check your email to verify your account.'); }
    else { await auth.signIn(email, password); setPassword(''); }
  }); };
  const confirmTransfer = () => { if (!session) return; void action(async () => {
    if (transfer === 'upload') { pendingUpload.current ??= { snapshot: parseHistoryJson(await onExport()), revision: metadata?.revision ?? 0, operationId: crypto.randomUUID() }; const pending = pendingUpload.current; const saved = await cloud.upload(pending.snapshot, pending.revision, pending.operationId, session); setMetadata(saved); pendingUpload.current = null; setMessage('Cloud save replaced with this device’s history.'); telemetry.track('cloud_transfer_result', { direction: 'upload', status: 'success' }); }
    if (transfer === 'download') { const saved = await cloud.download(session); await onReplace(JSON.stringify(saved.snapshot), transferRevision); setMetadata(saved.metadata); setMessage('This device’s history was replaced with your cloud save.'); telemetry.track('cloud_transfer_result', { direction: 'download', status: 'success' }); }
    setTransfer(null);
  }); };
  return <Dialog title="Account & cloud save" onClose={() => { if (!busy) onClose(); }} className="account-dialog">
    {!cloudConfigured && <p className="notice">{cloudConfigurationMessage}</p>}
    {error && <p role="alert" className="error-text">{error}</p>}{message && <p role="status" className="positive-text">{message}</p>}
    {session && mode !== 'password' ? <>
      <div className="account-summary"><p>{session.user.email}</p><span>{session.user.emailVerified ? 'Email verified' : 'Verify your email to use cloud saves'}</span></div>
      <div className="cloud-save-summary"><h2>Cloud save</h2><p>{metadata ? `Saved ${new Date(metadata.savedAt).toLocaleString()}` : metadataLoaded ? 'No cloud save yet.' : 'Cloud save status unavailable.'}</p>{metadata && <p>{metadata.roundCount} rounds · {metadata.attemptCount} solves</p>}</div>
      {transfer ? <section className="overwrite-confirmation"><h2>{transfer === 'upload' ? 'Replace your cloud save?' : 'Replace this device’s history?'}</h2><p>{transfer === 'upload' ? 'Your complete cloud history will be replaced with the history on this device.' : 'All events and rounds on this device will be replaced with your cloud save. Export first to keep a separate copy.'}</p><div className="button-row"><button type="button" className="primary-button" disabled={busy} onClick={confirmTransfer}>{busy ? 'Working…' : 'Replace history'}</button><button type="button" className="secondary-button" disabled={busy} onClick={() => { pendingUpload.current = null; setTransfer(null); }}>Cancel</button></div></section> : <div className="button-row"><button type="button" className="primary-button" disabled={!cloudConfigured || !metadataLoaded || !session.user.emailVerified || busy} onClick={() => { setTransferRevision(localRevision); setTransfer('upload'); }}>Upload</button><button type="button" className="secondary-button" disabled={!cloudConfigured || !metadata || !session.user.emailVerified || busy} onClick={() => { setTransferRevision(localRevision); setTransfer('download'); }}>Download</button></div>}
      <button type="button" className="text-button" disabled={busy || !cloudConfigured} onClick={() => void action(async () => { setMetadata(await cloud.getSaveMetadata(session)); setMetadataLoaded(true); pendingUpload.current = null; setTransfer(null); })}>Refresh cloud save status</button><p className="muted">One cloud save. Transfers happen only when you choose Upload or Download.</p>
      <div className="button-row"><button className="text-button" onClick={() => setMode('password')}>Change password</button><button className="text-button" disabled={busy} onClick={() => void action(async () => { await auth.signOut(); setMetadata(null); })}>Sign out</button></div>
    </> : <>
      {mode !== 'password' && <div className="settings-tabs"><button type="button" aria-pressed={mode === 'signIn'} onClick={() => setMode('signIn')}>Sign in</button><button type="button" aria-pressed={mode === 'signUp'} onClick={() => setMode('signUp')}>Create account</button></div>}
      <form onSubmit={submit} className="account-form">
        {mode !== 'password' && <label>Email<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} disabled={!auth.configured || busy} /></label>}
        {mode !== 'reset' && <label>{mode === 'password' ? 'New password' : 'Password'}<input type="password" minLength={mode === 'signIn' ? 1 : 12} autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} required value={password} onChange={event => setPassword(event.target.value)} disabled={!auth.configured || busy} /></label>}
        <button type="submit" className="primary-button" disabled={!auth.configured || busy}>{busy ? 'Working…' : mode === 'reset' ? 'Send reset link' : mode === 'password' ? 'Update password' : mode === 'signUp' ? 'Create account' : 'Sign in'}</button>
        {mode === 'signIn' && <button type="button" className="text-button" onClick={() => setMode('reset')}>Forgot password?</button>}
      </form><p className="muted">You do not need an account to use CompSim. Accounts let you save and transfer your history.</p>
    </>}
  </Dialog>;
}
