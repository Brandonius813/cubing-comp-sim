import { useEffect, useRef, useState, type FormEvent } from 'react';
import { auth, cloud, cloudConfigured, type AccountSession, type SaveMetadata } from '../cloud';
import { parseHistoryJson, type HistorySnapshot } from '../storage';
import { telemetry } from '../telemetry';
import { Dialog } from './primitives';
import { errorMessage, localizedDate, t, type MessageKey } from './i18n';

interface AccountDialogProps {
  session: AccountSession | null;
  recovery: boolean;
  onClose: () => void;
  onExport: () => Promise<string>;
  onReplace: (json: string, expectedRevision: number) => Promise<unknown>;
  localRevision: number;
}
export function AccountDialog({ session, recovery, onClose, onExport, onReplace, localRevision }: AccountDialogProps) {
  const [mode, setMode] = useState<'signIn' | 'signUp' | 'reset' | 'password'>(recovery ? 'password' : 'signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<MessageKey | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [metadata, setMetadata] = useState<SaveMetadata | null>(null);
  const [metadataLoaded, setMetadataLoaded] = useState(false);
  const [transfer, setTransfer] = useState<'upload' | 'download' | null>(null);
  const [transferRevision, setTransferRevision] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deletedResult, setDeletedResult] = useState<'deleted' | 'pending' | null>(null);
  const pendingUpload = useRef<{ snapshot: HistorySnapshot; revision: number; operationId: string } | null>(null);
  const requestBusy = useRef(false);

  const action = async (work: () => Promise<void>) => {
    if (requestBusy.current) return;
    requestBusy.current = true;
    setBusy(true); setError(''); setMessage(null);
    try { await work(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { requestBusy.current = false; setBusy(false); }
  };
  useEffect(() => { if (recovery) setMode('password'); }, [recovery]);
  useEffect(() => {
    if (!session || !cloudConfigured) return;
    let mounted = true;
    cloud.getSaveMetadata(session).then(result => {
      if (mounted) { setMetadata(result); setMetadataLoaded(true); }
    }).catch(cause => { if (mounted) setError(errorMessage(cause, 'cloudCheckError')); });
    return () => { mounted = false; };
  }, [session]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void action(async () => {
      if (mode === 'reset') {
        await auth.requestPasswordReset(email); setMessage('resetSent');
      } else if (mode === 'password') {
        await auth.updatePassword(password); setPassword(''); setMessage('passwordUpdated'); setMode('signIn');
      } else if (mode === 'signUp') {
        await auth.signUp(email, password); setPassword(''); setMessage('verifyEmailMessage');
      } else {
        await auth.signIn(email, password); setPassword('');
      }
    });
  };
  const confirmTransfer = () => {
    if (!session) return;
    void action(async () => {
      if (transfer === 'upload') {
        pendingUpload.current ??= {
          snapshot: parseHistoryJson(await onExport()),
          revision: metadata?.revision ?? 0,
          operationId: crypto.randomUUID(),
        };
        const pending = pendingUpload.current;
        const saved = await cloud.upload(pending.snapshot, pending.revision, pending.operationId, session);
        setMetadata(saved); pendingUpload.current = null; setMessage('uploadSuccess');
        telemetry.track('cloud_transfer_result', { direction: 'upload', status: 'success' });
      } else if (transfer === 'download') {
        const saved = await cloud.download(session);
        await onReplace(JSON.stringify(saved.snapshot), transferRevision);
        setMetadata(saved.metadata); setMessage('downloadSuccess');
        telemetry.track('cloud_transfer_result', { direction: 'download', status: 'success' });
      }
      setTransfer(null);
    });
  };
  const deleteAccount = (event: FormEvent) => {
    event.preventDefault();
    if (!session || deleteEmail.trim() !== session.user.email) {
      setError(t('deleteEmailMismatch')); return;
    }
    void action(async () => {
      const freshSession = await auth.reauthenticateForDeletion(deletePassword);
      const result = await cloud.deleteAccount(freshSession);
      // Account deletion never invokes a local-history mutation.
      await auth.signOutAfterDeletion();
      setDeletePassword(''); setDeleteEmail(''); setPassword('');
      setDeletedResult(result.status); setDeleting(false); setMetadata(null);
    });
  };

  return <Dialog title={t('accountTitle')} onClose={() => { if (!busy) onClose(); }} className="account-dialog">
    {!cloudConfigured && <p className="notice">{t('cloudUnavailable')}</p>}
    {error && <p role="alert" className="error-text">{error}</p>}
    {message && <p role="status" className="positive-text">{t(message)}</p>}
    {deletedResult ? <div className="account-form">
      <p role="status">{t(deletedResult === 'deleted' ? 'deleteSuccess' : 'deletePending')}</p>
      <button type="button" className="primary-button" onClick={onClose}>{t('close')}</button>
    </div> : session && mode !== 'password' ? <>
      <div className="account-summary">
        <p>{session.user.email}</p>
        <span>{t(session.user.emailVerified ? 'emailVerified' : 'verifyEmail')}</span>
      </div>
      {deleting ? <form className="account-form delete-confirmation" onSubmit={deleteAccount}>
        <h2>{t('deleteAccountTitle')}</h2>
        <p className="muted">{t('deleteDescription')}</p>
        <label>{t('deleteConfirmEmail')}<input type="email" required autoComplete="off" value={deleteEmail} disabled={busy} onChange={event => setDeleteEmail(event.target.value)} /></label>
        <label>{t('deletePassword')}<input type="password" required autoComplete="current-password" value={deletePassword} disabled={busy} onChange={event => setDeletePassword(event.target.value)} /></label>
        <div className="button-row">
          <button type="submit" className="danger-button" disabled={busy || deleteEmail.trim() !== session.user.email || !deletePassword}>{t(busy ? 'working' : 'deleteAction')}</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => { setDeleting(false); setDeletePassword(''); setDeleteEmail(''); }}>{t('cancel')}</button>
        </div>
      </form> : <>
        <div className="cloud-save-summary">
          <h2>{t('cloudSave')}</h2>
          <p>{metadata ? t('savedDate', { date: localizedDate(metadata.savedAt) }) : t(metadataLoaded ? 'noCloudSave' : 'cloudStatusUnavailable')}</p>
          {metadata && <p>{t('cloudCounts', { rounds: metadata.roundCount, solves: metadata.attemptCount })}</p>}
        </div>
        {transfer ? <section className="overwrite-confirmation">
          <h2>{t(transfer === 'upload' ? 'uploadTitle' : 'importTitle')}</h2>
          <p>{t(transfer === 'upload' ? 'uploadDescription' : 'downloadDescription')}</p>
          <div className="button-row">
            <button type="button" className="primary-button" disabled={busy} onClick={confirmTransfer}>{t(busy ? 'working' : 'replace')}</button>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => { pendingUpload.current = null; setTransfer(null); }}>{t('cancel')}</button>
          </div>
        </section> : <div className="button-row">
          <button type="button" className="primary-button" disabled={!cloudConfigured || !metadataLoaded || !session.user.emailVerified || busy} onClick={() => { setTransferRevision(localRevision); setTransfer('upload'); }}>{t('upload')}</button>
          <button type="button" className="secondary-button" disabled={!cloudConfigured || !metadata || !session.user.emailVerified || busy} onClick={() => { setTransferRevision(localRevision); setTransfer('download'); }}>{t('download')}</button>
        </div>}
        <button type="button" className="text-button" disabled={busy || !cloudConfigured} onClick={() => void action(async () => { setMetadata(await cloud.getSaveMetadata(session)); setMetadataLoaded(true); pendingUpload.current = null; setTransfer(null); })}>{t('refreshCloud')}</button>
        <p className="muted">{t('cloudManual')}</p>
        <div className="button-row">
          <button type="button" className="text-button" onClick={() => setMode('password')}>{t('changePassword')}</button>
          <button type="button" className="text-button" disabled={busy} onClick={() => void action(async () => { await auth.signOut(); setMetadata(null); })}>{t('signOut')}</button>
          <button type="button" className="text-button error-text" disabled={busy || !cloudConfigured} onClick={() => { setTransfer(null); setDeleting(true); setError(''); }}>{t('deleteAccount')}</button>
        </div>
      </>}
    </> : <>
      {mode !== 'password' && <div className="settings-tabs">
        <button type="button" aria-pressed={mode === 'signIn'} onClick={() => setMode('signIn')}>{t('signIn')}</button>
        <button type="button" aria-pressed={mode === 'signUp'} onClick={() => setMode('signUp')}>{t('createAccount')}</button>
      </div>}
      <form onSubmit={submit} className="account-form">
        {mode !== 'password' && <label>{t('email')}<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} disabled={!auth.configured || busy} /></label>}
        {mode !== 'reset' && <label>{t(mode === 'password' ? 'newPassword' : 'password')}<input type="password" minLength={mode === 'signIn' ? 1 : 12} autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} required value={password} onChange={event => setPassword(event.target.value)} disabled={!auth.configured || busy} /></label>}
        <button type="submit" className="primary-button" disabled={!auth.configured || busy}>{t(busy ? 'working' : mode === 'reset' ? 'sendReset' : mode === 'password' ? 'updatePassword' : mode === 'signUp' ? 'createAccount' : 'signIn')}</button>
        {mode === 'signIn' && <button type="button" className="text-button" onClick={() => setMode('reset')}>{t('forgotPassword')}</button>}
      </form>
      <p className="muted">{t('accountOptional')}</p>
    </>}
  </Dialog>;
}
