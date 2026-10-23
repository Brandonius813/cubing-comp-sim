import * as AppleAuthentication from 'expo-apple-authentication';
import { SvgXml } from 'react-native-svg';
import { wcaLogo } from './wca-logo';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Image, Linking, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
function confirm(title: string, message: string, action: string): Promise<boolean> {
  return new Promise(resolve => Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
    { text: action, onPress: () => resolve(true) },
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
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => { void AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => undefined); }, []);
  const [session, setSession] = useState<AccountSession | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
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
    catch (error) { if (mounted.current) setMessage(error instanceof CloudError ? error.message : 'The operation could not finish. Please retry.'); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); onBusyChange?.(false); }
  }
  const locked = busy || disabled;
  const info = (value: string) => { if (mounted.current) setMessage(value); };
  const transfer = (direction: 'upload' | 'download') => void run(async () => {
    const expectedLocal = getSnapshot();
    const ticket = direction === 'upload' ? await transfers.prepareUpload(expectedLocal) : await transfers.prepareDownload();
    const count = ticket.snapshot.rounds.reduce((total, round) => total + round.attempts.length, 0);
    const approved = await confirm(`${direction === 'upload' ? 'Upload' : 'Download'} ${count} solves and ${ticket.snapshot.rounds.length} rounds?`,
      direction === 'upload' ? 'This will overwrite the cloud save.' : 'This will overwrite the local save.',
      direction === 'upload' ? 'Upload' : 'Download');
    if (!approved) { transfers.cancel(); return; }
    const result = await transfers.confirm(ticket, snapshot => replaceSnapshot(snapshot, expectedLocal));
    setMetadata(result);
    info(`${direction === 'upload' ? 'Uploaded' : 'Downloaded'} ${count} solves and ${ticket.snapshot.rounds.length} rounds.`);
  });
  return <View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.title}>Accounts and cloud saves</Text>
    {!auth.configured ? <Text style={styles.notice}>Accounts are not configured in this build. Your times remain on this device.</Text> : !session ? <>
      {(['google', 'wca'] as const).map(provider => <Pressable key={provider} accessibilityRole="button"
        disabled={locked || !auth.providers.includes(provider)} style={[styles.providerButton, (locked || !auth.providers.includes(provider)) && styles.disabled]}
        onPress={() => void run(() => auth.signInWithProvider(provider))}>
        <View style={{ backgroundColor: '#fff', padding: 4, borderRadius: 4 }}>
          {provider === 'google' ? <Image source={require('../../assets/google-g.png')} style={{ width: 20, height: 20 }} />
            : <SvgXml xml={wcaLogo} width={20} height={20} />}
        </View>
        <Text style={styles.buttonText}>Sign in with {provider === 'google' ? 'Google' : 'WCA'}</Text>
      </Pressable>)}
      {appleAvailable && auth.providers.includes('apple') && <View pointerEvents={locked ? 'none' : 'auto'} style={locked && styles.disabled}>
        <AppleAuthentication.AppleAuthenticationButton buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={theme.background === '#ffffff' ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={10} style={{ height: 48, width: '100%' }} onPress={() => { if (!locked) void run(() => auth.signInWithProvider('apple')); }} />
      </View>}
      <TextInput accessibilityLabel="Account email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" placeholder="Email" placeholderTextColor={theme.muted} value={email} onChangeText={setEmail} editable={!locked} style={styles.input} />
      <TextInput accessibilityLabel="Account password" autoCapitalize="none" autoCorrect={false} secureTextEntry textContentType="password" placeholder="Password" placeholderTextColor={theme.muted} value={password} onChangeText={setPassword} editable={!locked} style={styles.input} />
      <Action label="Sign in" disabled={locked || !email.trim() || !password} onPress={() => void run(async () => { try { await auth.signIn(email, password); info('Signed in. Use Upload or Download to transfer a save.'); } finally { setPassword(''); } })} />
      <Action label="Create account" disabled={locked || !email.trim() || password.length < 8} onPress={() => void run(async () => { try { const active = await auth.signUp(email, password); info(active ? 'Account created. No history was transferred.' : 'Check your email to confirm the account, then return here to sign in.'); } finally { setPassword(''); } })} />
      <Action label="Send password reset email" disabled={locked || !email.trim()} onPress={() => void run(async () => { await auth.requestPasswordReset(email); info('If this address has an account, a reset email will arrive. Complete the reset on the website, then sign in here.'); })} />

    </> : <>
      <Text style={styles.identity}>{session.user.email || 'Signed-in account'}</Text>
      {!session.user.emailVerified && <Text style={styles.notice}>Verify your email before using cloud saves.</Text>}
      {!cloud.configured && <Text style={styles.notice}>The cloud API is not configured in this build.</Text>}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={styles.caption}>Cloud Save</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh cloud save" disabled={locked || !cloud.configured || !session.user.emailVerified}
          style={{ padding: 12 }} onPress={() => void run(async () => { setMetadata(await cloud.getSaveMetadata(await auth.verifiedSession())); })}>
          <Text style={{ color: theme.accent, fontSize: 24 }}>↻</Text>
        </Pressable>
      </View>
      {metadata !== undefined && <Text style={styles.caption}>{metadata === null ? 'No cloud save.' : `${metadata.attemptCount} solves · ${metadata.roundCount} rounds · ${new Date(metadata.savedAt).toLocaleString()}`}</Text>}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 24 }}>
        <Action label="Upload" disabled={locked || !cloud.configured || !session.user.emailVerified} onPress={() => transfer('upload')} />
        <Action label="Download" disabled={locked || !cloud.configured || !session.user.emailVerified} onPress={() => transfer('download')} />
      </View>
      <Action label="Sign out" disabled={locked} onPress={() => void run(async () => { await auth.signOut(); info('Signed out. Local history is unchanged.'); })} />
      <Action label="Delete account and cloud save" destructive disabled={locked} onPress={() => { setMessage(''); setDeleteOpen(true); }} />
      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => { if (!busy) { setDeleteOpen(false); setPassword(''); } }}>
        <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: theme.background, borderRadius: 16, padding: 24, gap: 12 }}>
            <Text style={styles.title}>Delete account and cloud save?</Text>
            <Text style={styles.notice}>This is permanent. Local history stays on this device.</Text>
            {session.user.providers?.includes('email') ? <>
              <TextInput accessibilityLabel="Confirm password for account deletion" placeholder="Password" placeholderTextColor={theme.muted}
                secureTextEntry autoCapitalize="none" autoCorrect={false} value={password} onChangeText={setPassword} editable={!locked} style={styles.input} />
              <Action label="Delete account" destructive disabled={locked || !password || !cloud.configured} onPress={() => void run(async () => {
                try {
                  const status = await auth.deleteWithPassword(password, session.user.id, proof => cloud.deleteAccount(proof));
                  setSession(null); setDeleteOpen(false);
                  info(status === 'deleted' ? 'Account deleted.' : 'Deletion requested. Cleanup is pending.');
                } finally { setPassword(''); }
              })} />
            </> : <Action label="Continue on website" destructive disabled={locked} onPress={() => {
              const webUrl = process.env.EXPO_PUBLIC_WEB_URL;
              if (webUrl) void Linking.openURL(webUrl + '/?account=delete');
              setDeleteOpen(false);
            }} />}
            <Action label="Cancel" disabled={busy} onPress={() => { setDeleteOpen(false); setPassword(''); }} />
            {!!message && <Text style={styles.notice}>{message}</Text>}
          </View>
        </View>
      </Modal>
    </>}
    {busy && <Text accessibilityLiveRegion="polite" style={styles.caption}>Working…</Text>}
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text>}
  </View>;
}
const makeStyles = (theme: ReturnType<typeof useMobileTheme>) => StyleSheet.create({
  panel: { gap: 10 }, title: { color: theme.text, fontFamily: theme.fontFamily, fontSize: 20, fontWeight: '600', marginBottom: 10 },
  caption: { color: theme.muted, fontFamily: theme.fontFamily, fontSize: 15, lineHeight: 22 }, notice: { color: theme.text, fontFamily: theme.fontFamily, fontSize: 15, lineHeight: 22 },
  identity: { color: theme.text, fontFamily: theme.fontFamily, fontSize: 18, fontWeight: '600' }, input: { color: theme.text, fontFamily: theme.fontFamily, borderBottomWidth: 1, borderColor: theme.border, paddingVertical: 12, minHeight: 48, fontSize: 17 },
  providerButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, borderWidth: 1, borderColor: theme.accent, borderRadius: 10, minHeight: 48 },
  button: { paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  buttonText: { color: theme.accent, fontFamily: theme.fontFamily, fontSize: 17 }, destructive: {}, disabled: { opacity: 0.45 },
});
