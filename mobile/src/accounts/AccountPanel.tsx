import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CloudError, type AccountSession, type SaveMetadata } from '../../../src/cloud/types';
import type { HistorySnapshot } from '../../../src/storage/validation';
import { useMobileTheme } from '../ui';
import { createNativeAccountServices, type NativeAccountServices } from './runtime';

export interface AccountPanelProps {
  getSnapshot: () => HistorySnapshot;
  /** Must validate, check expectedLocal is still current, preserve recovery copy,
   * atomically commit replacement, then update App state. Reject on failure. */
  replaceSnapshot: (snapshot: HistorySnapshot, expectedLocal: HistorySnapshot) => Promise<void>;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  services?: NativeAccountServices;
}
function confirm(title: string, message: string): Promise<boolean> {
  return new Promise(resolve => Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
    { text: 'Replace', style: 'destructive', onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) }));
}
function Action({ label, onPress, disabled = false, destructive = false }: { label: string; onPress: () => void; disabled?: boolean; destructive?: boolean }) {
  const theme = useMobileTheme();
  const styles = makeStyles(theme);
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} onPress={onPress} disabled={disabled}
    style={[styles.button, disabled && styles.disabled, destructive && styles.destructive]}><Text style={[styles.buttonText, destructive && {color: theme.danger}]}>{label}</Text></Pressable>;
}
export function AccountPanel({ getSnapshot, replaceSnapshot, disabled = false, onBusyChange, services: injected }: AccountPanelProps) {
  const theme = useMobileTheme();
  const styles = makeStyles(theme);
  const [services] = useState(() => injected ?? createNativeAccountServices());
  const { auth, cloud, transfers } = services;
  const [session, setSession] = useState<AccountSession | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState('');
  const [metadata, setMetadata] = useState<SaveMetadata | null | undefined>(undefined);
  const accountId = useRef<string | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const accept = (next: AccountSession | null) => {
      if (!mounted.current) return;
      if (accountId.current !== next?.user.id) { transfers.cancel(); setMetadata(undefined); setPassword(''); }
      accountId.current = next?.user.id; setSession(next);
    };
    const report = () => { if (mounted.current) setMessage('Account session could not be restored. Guest practice is still available.'); };
    const unsubscribe = auth.subscribe(accept);
    void auth.getSession().then(accept).catch(report);
    const callback = (url: string | null) => { if (url) void auth.handleCallback(url).catch(() => { if (mounted.current) setMessage('Sign-in could not be completed. Please start again.'); }); };
    void Linking.getInitialURL().then(callback).catch(report);
    const link = Linking.addEventListener('url', event => callback(event.url));
    auth.setActive(AppState.currentState === 'active');
    const state = AppState.addEventListener('change', next => auth.setActive(next === 'active'));
    return () => { mounted.current = false; unsubscribe(); link.remove(); state.remove(); transfers.cancel(); if (!injected) auth.dispose(); };
  }, [auth, transfers, injected]);
  async function run(task: () => Promise<void>) {
    if (busyRef.current || disabled) return;
    busyRef.current = true; setBusy(true); onBusyChange?.(true); setMessage('');
    try { await task(); }
    catch (error) { if (mounted.current) setMessage(error instanceof CloudError ? error.message : 'The operation could not finish. Your local history has not been replaced.'); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); onBusyChange?.(false); }
  }
  const locked = busy || disabled;
  const info = (value: string) => { if (mounted.current) setMessage(value); };
  const transfer = (direction: 'upload' | 'download') => void run(async () => {
    const expectedLocal = getSnapshot();
    const ticket = direction === 'upload' ? await transfers.prepareUpload(expectedLocal) : await transfers.prepareDownload();
    const count = ticket.snapshot.rounds.reduce((total, round) => total + round.attempts.length, 0);
    const approved = await confirm(direction === 'upload' ? 'Replace cloud save?' : 'Replace local history?',
      direction === 'upload'
        ? `Upload ${count} solves in ${ticket.snapshot.rounds.length} rounds to ${session?.user.email || 'this account'}? This replaces its previous cloud save. Local history stays on this device.`
        : `Download ${count} solves in ${ticket.snapshot.rounds.length} rounds? This replaces local history and ends the current local draft. A recovery copy will be kept. Settings stay on this device.`);
    if (!approved) { transfers.cancel(); return; }
    const result = await transfers.confirm(ticket, snapshot => replaceSnapshot(snapshot, expectedLocal));
    setMetadata(result);
    info(direction === 'upload' ? 'Cloud save uploaded. Local history is unchanged.' : 'Cloud save downloaded and stored on this device.');
  });
  return <View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.title}>Accounts and cloud saves</Text>
    {!auth.configured ? <Text style={styles.notice}>Accounts are not configured in this build. Your times remain on this device.</Text> : !session ? <>
      {(['google', 'apple', 'wca'] as const).map(provider => <Action key={provider} label={`Sign in with ${provider === 'google' ? 'Google' : provider === 'apple' ? 'Apple' : 'WCA'}`} disabled={locked || provider === 'apple' || !auth.providers.includes(provider)} onPress={() => { if (provider !== 'apple') void run(async () => { await auth.signInWithProvider(provider); }); }} />)}
      <Text style={styles.caption}>Apple sign-in requires provider setup.</Text>
      <TextInput accessibilityLabel="Account email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" placeholder="Email" placeholderTextColor={theme.muted} value={email} onChangeText={setEmail} editable={!locked} style={styles.input} />
      <TextInput accessibilityLabel="Account password" autoCapitalize="none" autoCorrect={false} secureTextEntry textContentType="password" placeholder="Password" placeholderTextColor={theme.muted} value={password} onChangeText={setPassword} editable={!locked} style={styles.input} />
      <Action label="Sign in" disabled={locked || !email.trim() || !password} onPress={() => void run(async () => { try { await auth.signIn(email, password); info('Signed in. Use Upload or Download to transfer a save.'); } finally { setPassword(''); } })} />
      <Action label="Create account" disabled={locked || !email.trim() || password.length < 8} onPress={() => void run(async () => { try { const active = await auth.signUp(email, password); info(active ? 'Account created. No history was transferred.' : 'Check your email to confirm the account, then return here to sign in.'); } finally { setPassword(''); } })} />
      <Action label="Send password reset email" disabled={locked || !email.trim()} onPress={() => void run(async () => { await auth.requestPasswordReset(email); info('If this address has an account, a reset email will arrive. Complete the reset on the website, then sign in here.'); })} />

    </> : <>
      <Text style={styles.identity}>{session.user.email || 'Signed-in account'}</Text>
      {!session.user.emailVerified && <Text style={styles.notice}>Verify your email before using cloud saves.</Text>}
      <Text style={styles.caption}>{metadata === undefined ? 'Cloud save has not been checked.' : metadata === null ? 'No cloud save on this account.' : `Last cloud save: ${new Date(metadata.savedAt).toLocaleString()} · ${metadata.attemptCount} solves · revision ${metadata.revision}`}</Text>
      {!cloud.configured && <Text style={styles.notice}>The cloud API is not configured in this build.</Text>}
      <Action label="Check cloud save" disabled={locked || !cloud.configured || !session.user.emailVerified} onPress={() => void run(async () => { setMetadata(await cloud.getSaveMetadata(await auth.verifiedSession())); })} />
      <Action label="Upload local history" disabled={locked || !cloud.configured || !session.user.emailVerified} onPress={() => transfer('upload')} />
      <Action label="Download cloud history" disabled={locked || !cloud.configured || !session.user.emailVerified} onPress={() => transfer('download')} />
      <Action label="Sign out" disabled={locked} onPress={() => void run(async () => { await auth.signOut(); info('Signed out. Local history is unchanged.'); })} />
      {session.user.providers?.includes('email') ? <>
        <Text style={styles.caption}>To delete your account and cloud save, enter your password again. Local history will remain on this device.</Text>
        <TextInput accessibilityLabel="Confirm password for account deletion" secureTextEntry autoCapitalize="none" autoCorrect={false} value={password} onChangeText={setPassword} editable={!locked} style={styles.input} />
        <Action label="Delete account and cloud save" destructive disabled={locked || !password || !cloud.configured} onPress={() => void run(async () => {
          const id = session.user.id;
          const approved = await new Promise<boolean>(resolve => Alert.alert('Permanently delete account?', 'Your account and cloud save will be deleted. Local practice history stays on this device. This cannot be undone.', [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Delete account', style: 'destructive', onPress: () => resolve(true) },
          ], { cancelable: true, onDismiss: () => resolve(false) }));
          if (!approved) return;
          try { const status = await auth.deleteWithPassword(password, id, proof => cloud.deleteAccount(proof)); setSession(null); info(status === 'deleted' ? 'Account deleted. Local history is unchanged.' : 'Deletion requested. Cloud access is blocked while cleanup retries. Local history is unchanged.'); }
          finally { setPassword(''); }
        })} />
      </> : <Text style={styles.notice}>Provider account deletion needs fresh provider confirmation. Use Settings → Account on the website. Native provider deletion is not yet enabled.</Text>}
    </>}
    {busy && <Text accessibilityLiveRegion="polite" style={styles.caption}>Working…</Text>}
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text>}
  </View>;
}
const makeStyles = (theme: ReturnType<typeof useMobileTheme>) => StyleSheet.create({
  panel: { gap: 10 }, title: { color: theme.text, fontFamily: theme.fontFamily, fontSize: 20, fontWeight: '600', marginBottom: 10 },
  caption: { color: theme.muted, fontFamily: theme.fontFamily, fontSize: 15, lineHeight: 22 }, notice: { color: theme.text, fontFamily: theme.fontFamily, fontSize: 15, lineHeight: 22 },
  identity: { color: theme.text, fontFamily: theme.fontFamily, fontSize: 18, fontWeight: '600' }, input: { color: theme.text, fontFamily: theme.fontFamily, borderBottomWidth: 1, borderColor: theme.border, paddingVertical: 12, minHeight: 48, fontSize: 17 },
  button: { paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  buttonText: { color: theme.accent, fontFamily: theme.fontFamily, fontSize: 17 }, destructive: {}, disabled: { opacity: 0.45 },
});
